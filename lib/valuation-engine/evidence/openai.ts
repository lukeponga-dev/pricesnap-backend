import type { CandidateListing, IdentifiedItem, MarketEvidence } from "../types";
import { buildSearchQueries } from "./queries";
import { validateCandidates } from "./validate";
import { ApiError } from "../../api/errors";

type OpenAIResponse = { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };

export function getOpenAIEvidenceModel(): string {
  return process.env.OPENAI_EVIDENCE_MODEL?.trim() || "gpt-5.6-luna";
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
      if (typeof v.title !== "string" || typeof v.price !== "number" || v.currency !== "NZD" ||
          typeof v.url !== "string" || !v.url.startsWith("https://")) return [];
      return [{ title: v.title, price: v.price, currency: "NZD",
        source: typeof v.source === "string" ? v.source : new URL(v.url).hostname,
        url: v.url, listedAt: typeof v.listedAt === "string" ? v.listedAt : undefined }];
    });
  } catch { return []; }
}

export async function findOpenAIMarketEvidence(item: IdentifiedItem, signal?: AbortSignal): Promise<MarketEvidence> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new ApiError("SERVICE_NOT_CONFIGURED");
  const searchQueries = buildSearchQueries(item);
  const model = getOpenAIEvidenceModel();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model, tools: [{ type: "web_search" }], tool_choice: "auto",
      input: `Research current New Zealand second-hand listings for this item: ${JSON.stringify(item.item)}.
Suggested queries: ${JSON.stringify(searchQueries)}.
Return ONLY a JSON array of {"title":string,"price":number,"currency":"NZD","source":string,"url":string,"listedAt":string|null}.
Only use individual used listings for the same item/variant whose source explicitly shows NZD or NZ$. Never convert currency or infer it from a bare $. Exclude accessories, bundles, retail-new stock, search pages and unrelated variants. URL must be an actual source discovered by web search. Never invent listings, URLs or prices. Return [] when evidence is insufficient.`,
    }),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new ApiError("SERVICE_NOT_CONFIGURED");
    if (response.status === 429) throw new ApiError("PROVIDER_RATE_LIMIT");
    if (response.status === 404) throw new ApiError("PROVIDER_MODEL_UNAVAILABLE");
    throw new ApiError("VALUATION_FAILED");
  }
  const payload = await response.json() as OpenAIResponse;
  const candidates = parseOpenAICandidates(responseText(payload));
  const comparables = validateCandidates(item, candidates).map(c => ({
    title: c.title, price: c.price, currency: "NZD", source: c.source, url: c.url,
    variantMatch: c.variantMatch, freshness: c.freshness,
  }));
  console.info(JSON.stringify({ event: "market_evidence", provider: "openai", model, extracted: candidates.length, accepted: comparables.length }));
  return { searchQueries, comparables };
}
