import type { CandidateListing, IdentifiedItem, MarketEvidence } from "../types";
import { buildBroaderSearchQueries, buildGlobalMarketplaceQueries, buildSearchQueries } from "./queries";
import { validateCandidates } from "./validate";
import { ApiError } from "../../api/errors";

type OpenAIResponse = { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };

export function getOpenAIEvidenceModel(): string {
  return process.env.OPENAI_EVIDENCE_MODEL?.trim() || "gpt-5.4-mini";
}

function responseText(payload: OpenAIResponse): string {
  if (payload.output_text) return payload.output_text;
  return payload.output?.flatMap(o => o.content ?? []).filter(c => c.type === "output_text" && typeof c.text === "string").map(c => c.text).join("\n") ?? "";
}

export function parseOpenAICandidates(text: string): CandidateListing[] {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap(row => {
      if (!row || typeof row !== "object") return [];
      const v = row as Record<string, unknown>;
      if (typeof v.title !== "string" || typeof v.price !== "number" || 
          (v.currency !== "NZD" && v.currency !== "USD") ||
          typeof v.url !== "string" || !v.url.startsWith("https://")) return [];
      return [{ title: v.title, price: v.price, currency: v.currency as "NZD" | "USD",
        source: typeof v.source === "string" ? v.source : new URL(v.url).hostname,
        url: v.url, listedAt: typeof v.listedAt === "string" ? v.listedAt : undefined }];
    });
  } catch { return []; }
}

async function researchCandidates(
  apiKey: string,
  model: string,
  item: IdentifiedItem,
  searchQueries: string[],
  signal?: AbortSignal,
): Promise<CandidateListing[]> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model, tools: [{ type: "web_search" }], tool_choice: "auto",
      input: `Research current second-hand listings for this item: ${JSON.stringify(item.item)}.
Suggested queries: ${JSON.stringify(searchQueries)}.
Return ONLY a JSON array of {"title":string,"price":number,"currency":"NZD"|"USD","source":string,"url":string,"listedAt":string|null}.
Only use individual used listings for the same item/variant whose source explicitly shows NZD or USD. Never convert currency or infer it from a bare $. Exclude accessories, bundles, retail-new stock, search pages and unrelated variants. URL must be an actual source discovered by web search. Never invent listings, URLs or prices. Return [] when evidence is insufficient.`,
    }),
  });
  if (!response.ok) {
    let providerType: string | undefined;
    let providerCode: string | undefined;
    let providerMessage: string | undefined;
    try {
      const body = await response.json() as {
        error?: { type?: unknown; code?: unknown; message?: unknown };
      };
      providerType = typeof body.error?.type === "string" ? body.error.type : undefined;
      providerCode = typeof body.error?.code === "string" ? body.error.code : undefined;
      providerMessage = typeof body.error?.message === "string"
        ? body.error.message.slice(0, 240)
        : undefined;
    } catch {
      // Do not log raw provider bodies; they are unnecessary for diagnosis.
    }
    console.error(JSON.stringify({
      event: "openai_provider_error",
      status: response.status,
      model,
      providerType,
      providerCode,
      providerMessage,
      providerRequestId: response.headers.get("x-request-id") ?? undefined,
    }));
    if (response.status === 401 || response.status === 403) throw new ApiError("SERVICE_NOT_CONFIGURED");
    if (response.status === 429) throw new ApiError("PROVIDER_RATE_LIMIT");
    if (response.status === 404) throw new ApiError("PROVIDER_MODEL_UNAVAILABLE");
    throw new ApiError("VALUATION_FAILED");
  }
  const payload = await response.json() as OpenAIResponse;
  return parseOpenAICandidates(responseText(payload));
}

function priceAppearsInSource(body: string, candidate: CandidateListing): boolean {
  const normalized = body.replace(/&nbsp;|&#160;/gi, " ").replace(/\\s+/g, " ").toUpperCase();
  const plain = candidate.price.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 2 });
  const grouped = candidate.price.toLocaleString("en-US", { useGrouping: true, maximumFractionDigits: 2 });
  const currencyMarkers = candidate.currency === "NZD" ? ["NZD", "NZ$"] : ["USD", "US$"];
  for (const amount of new Set([plain, grouped])) {
    let index = normalized.indexOf(amount.toUpperCase());
    while (index >= 0) {
      const nearby = normalized.slice(Math.max(0, index - 24), index + amount.length + 24);
      if (currencyMarkers.some(marker => nearby.includes(marker))) return true;
      index = normalized.indexOf(amount.toUpperCase(), index + amount.length);
    }
  }
  return false;
}

async function verifyCandidateSource(candidate: CandidateListing, signal?: AbortSignal): Promise<boolean> {
  try {
    const source = new URL(candidate.url);
    if (source.protocol !== "https:" || source.username || source.password) return false;
    const response = await fetch(source, {
      method: "GET", redirect: "follow",
      signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(7_000)]),
      headers: { "User-Agent": "PriceSnapEvidenceVerifier/1.0" },
    });
    if (!response.ok) return false;
    const finalUrl = new URL(response.url);
    if (source.hostname.replace(/^www\\./, "") !== finalUrl.hostname.replace(/^www\\./, "")) return false;
    const body = (await response.text()).slice(0, 1_500_000);
    return priceAppearsInSource(body, candidate);
  } catch { return false; }
}

async function verifyCandidateSources(candidates: CandidateListing[], signal?: AbortSignal): Promise<CandidateListing[]> {
  const checked = await Promise.all(candidates.map(async candidate => ({ candidate, verified: await verifyCandidateSource(candidate, signal) })));
  return checked.filter(result => result.verified).map(result => result.candidate);
}
export async function findOpenAIMarketEvidence(item: IdentifiedItem, signal?: AbortSignal): Promise<MarketEvidence> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new ApiError("SERVICE_NOT_CONFIGURED");
  const model = getOpenAIEvidenceModel();
  const queryPasses = [
    buildSearchQueries(item),
    buildBroaderSearchQueries(item),
    buildGlobalMarketplaceQueries(item),
  ];

  const allCandidates: CandidateListing[] = [];
  const seenUrls = new Set<string>();
  let searchQueries = queryPasses[0] ?? [];

  for (let pass = 0; pass < queryPasses.length; pass += 1) {
    const queries = queryPasses[pass] ?? [];
    searchQueries = [...new Set([...searchQueries, ...queries])];
    const candidates = await researchCandidates(apiKey, model, item, queries, signal);
    for (const candidate of candidates) {
      if (!candidate.url || seenUrls.has(candidate.url)) continue;
      seenUrls.add(candidate.url);
      allCandidates.push(candidate);
    }

    const sourceVerified = await verifyCandidateSources(allCandidates, signal);
    const accepted = validateCandidates(item, sourceVerified);
    console.info(JSON.stringify({
      event: "market_evidence_pass",
      provider: "openai",
      model,
      pass: pass + 1,
      extracted: allCandidates.length,
      accepted: accepted.length,
    }));
    if (accepted.length >= 2) break;
  }

  const sourceVerified = await verifyCandidateSources(allCandidates, signal);
  const comparables = validateCandidates(item, sourceVerified).map(candidate => ({
    title: candidate.title,
    price: candidate.price,
    currency: candidate.currency,
    source: candidate.source,
    url: candidate.url,
    variantMatch: candidate.variantMatch,
    freshness: candidate.freshness,
  }));
  console.info(JSON.stringify({
    event: "market_evidence",
    provider: "openai",
    model,
    extracted: allCandidates.length,
    sourceVerified: sourceVerified.length,
    accepted: comparables.length,
  }));
  return { searchQueries, comparables };
}
