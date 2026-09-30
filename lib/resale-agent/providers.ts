import type { ListingContext, ListingDraft, ListingProvider } from "./types";

function cleanText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maximum) : undefined;
}

export class DeterministicListingProvider implements ListingProvider {
  async generate({ valuation, strategy, preferences }: ListingContext): Promise<ListingDraft> {
    const title = cleanText(
      [valuation.item.brand, valuation.item.model || valuation.item.name, valuation.condition.grade]
        .filter(Boolean).join(" "),
      80,
    ) || valuation.item.name.slice(0, 80);
    const price = strategy.suggestedListingPrice === null
      ? "Price after further market research."
      : `Suggested asking price: NZD ${strategy.suggestedListingPrice}.`;
    const details = cleanText(preferences.notes, 500);
    return {
      title,
      description: [
        `${valuation.item.name} in ${valuation.condition.grade.toLowerCase()} visible condition.`,
        ...valuation.condition.notes.map((note) => `Visible condition: ${note}.`),
        details,
        price,
        "Functionality and included accessories should be confirmed before publishing.",
      ].filter(Boolean).join(" "),
      provider: "deterministic",
    };
  }
}

interface OpenAIResponse {
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}

const DEFAULT_OPENAI_TIMEOUT_MS = 8_000;
const MAX_OPENAI_TIMEOUT_MS = 10_000;

function getOpenAITimeout(): number {
  const configured = Number(process.env.OPENAI_RESALE_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 1_000
    ? Math.min(Math.round(configured), MAX_OPENAI_TIMEOUT_MS)
    : DEFAULT_OPENAI_TIMEOUT_MS;
}

export class OpenAIListingProvider implements ListingProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.OPENAI_RESALE_MODEL?.trim() || "o4-mini",
    private readonly timeoutMs = getOpenAITimeout(),
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async generate(context: ListingContext, signal?: AbortSignal): Promise<ListingDraft> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, this.timeoutMs);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await this.fetcher("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: controller.signal,
        headers: { "Authorization": `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          instructions: "Write accurate New Zealand resale listing copy. Use only supplied facts. Never invent specifications, accessories, functionality, defects, provenance, or market evidence.",
          input: JSON.stringify({
            item: context.valuation.item,
            condition: context.valuation.condition,
            saleStrategy: context.strategy,
            sellerPreferences: context.preferences,
          }),
          text: { format: { type: "json_schema", name: "resale_listing", strict: true, schema: {
            type: "object", additionalProperties: false,
            properties: { title: { type: "string", maxLength: 80 }, description: { type: "string", maxLength: 2000 } },
            required: ["title", "description"],
          } } },
        }),
      });
      if (!response.ok) throw new Error(`OpenAI listing provider failed (${response.status})`);
      const payload = await response.json() as OpenAIResponse;
      const outputText = payload.output?.flatMap((item) => item.content || [])
        .find((part) => part.type === "output_text")?.text;
      if (!outputText) throw new Error("OpenAI listing provider returned no output");
      const parsed = JSON.parse(outputText) as Record<string, unknown>;
      const title = cleanText(parsed.title, 80);
      const description = cleanText(parsed.description, 2000);
      if (!title || !description) throw new Error("OpenAI listing provider returned invalid output");
      return { title, description, provider: "openai" };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
}

export function createListingProvider(): ListingProvider {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  return apiKey ? new OpenAIListingProvider(apiKey) : new DeterministicListingProvider();
}
