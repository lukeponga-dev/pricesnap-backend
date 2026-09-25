/**
 * Market evidence step — turns identification into priced comparables.
 *
 * Flow:
 *   1. buildSearchQueries   — deterministic query strings from the item
 *   2. retrieveCandidates   — fetch listing-like candidates (adapter swap point)
 *   3. validateCandidates   — reject accessories, wrong variants, non-NZD, etc.
 *   4. normalizeComparables — NZD integers + quality scores for confidence
 *
 * Today `retrieveCandidates` uses Gemini as a stand-in for live Trade Me /
 * Marketplace search. Replace that function later without changing pricing.
 */
import { Type } from "@google/genai";
import { getAiClient, MODEL } from "../ai/client";
import { parseModelJson } from "../ai/parse-json";
import type {
  CandidateListing,
  IdentifiedItem,
  MarketEvidence,
  ScoredComparable,
} from "../types";
import { buildSearchQueries } from "./queries";
import { validateCandidates } from "./validate";

const candidatesSchema = {
  type: Type.OBJECT,
  properties: {
    candidates: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          price: { type: Type.NUMBER },
          currency: { type: Type.STRING },
          source: {
            type: Type.STRING,
            description: "e.g. Trade Me, Marketplace, NZ retailer",
          },
          url: { type: Type.STRING },
          listedAt: {
            type: Type.STRING,
            description: "ISO date if known, otherwise omit",
          },
          relevanceNotes: { type: Type.STRING },
        },
        required: ["title", "price", "currency", "source"],
      },
    },
  },
  required: ["candidates"],
};

interface CandidatesModelResponse {
  candidates: CandidateListing[];
}

/**
 * Gather and filter NZD market evidence for an identified item.
 */
export async function findMarketEvidence(
  item: IdentifiedItem,
): Promise<MarketEvidence> {
  const searchQueries = buildSearchQueries(item);
  const raw = await retrieveCandidates(item, searchQueries);
  const validated = validateCandidates(item, raw);
  const comparables = normalizeComparables(validated);

  return { searchQueries, comparables };
}

/**
 * Retrieve candidate listings for the search queries.
 *
 * Temporary: model proposes realistic used NZ listings from training knowledge.
 * Swap for live marketplace APIs when available — keep the same return type.
 */
async function retrieveCandidates(
  item: IdentifiedItem,
  searchQueries: string[],
): Promise<CandidateListing[]> {
  const ai = getAiClient();

  const attrLines = Object.entries(item.item.attributes)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      [
        "You help gather NZ second-hand market evidence for appraisal.",
        "Propose 6–10 realistic candidate used listings that would appear for these search queries.",
        "Prices must be NZD and reflect used/resale, not sealed retail.",
        "Include a mix of Trade Me / Marketplace style titles.",
        "Prefer matching the same model and known attributes.",
        "If an attribute is Unknown, do not invent a specific variant in titles.",
        "Do not invent live URLs; omit url.",
        "Mark listedAt only if you have a plausible recent window (ISO date).",
        "",
        `Item name: ${item.item.name}`,
        `Brand: ${item.item.brand ?? "Unknown"}`,
        `Model: ${item.item.model ?? "Unknown"}`,
        `Category: ${item.item.category}`,
        `Attributes: ${attrLines || "none"}`,
        `Condition: ${item.condition.grade} (${item.condition.score}/100)`,
        `Search queries: ${searchQueries.join(" | ")}`,
      ].join("\n"),
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: candidatesSchema,
    },
  });

  const parsed = parseModelJson<CandidatesModelResponse>(response.text);
  return (parsed.candidates ?? []).map((c) => ({
    title: c.title,
    price: Number(c.price),
    currency: (c.currency || "NZD").toUpperCase(),
    source: c.source,
    ...(c.url ? { url: c.url } : {}),
    ...(c.listedAt ? { listedAt: c.listedAt } : {}),
    ...(c.relevanceNotes ? { relevanceNotes: c.relevanceNotes } : {}),
  }));
}

/** Round prices, force NZD, attach scores, sort ascending for median pricing. */
function normalizeComparables(
  validated: Array<
    CandidateListing & { variantMatch: number; freshness: number }
  >,
): ScoredComparable[] {
  return validated
    .map((c) => ({
      title: c.title.trim(),
      price: Math.round(c.price),
      currency: "NZD",
      source: c.source,
      ...(c.url ? { url: c.url } : {}),
      variantMatch: c.variantMatch,
      freshness: c.freshness,
    }))
    .sort((a, b) => a.price - b.price);
}
