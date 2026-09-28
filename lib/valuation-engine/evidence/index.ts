/**
 * Market evidence step - turns identification into priced comparables.
 *
 * Flow:
 *   1. buildSearchQueries   - deterministic query strings from the item
 *   2. retrieveCandidates   - fetch listing-like candidates from real sources
 *   3. validateCandidates   - reject accessories, wrong variants, non-NZD, etc.
 *   4. normalizeComparables - NZD integers + quality scores for confidence
 *
 * Do not use a model to synthesize market comparables. Until live retrieval is
 * available, this legacy module returns no comparables. The active public entry
 * point delegates retrieval and pricing to the shared pricesnapai service.
 */
import type {
  CandidateListing,
  IdentifiedItem,
  MarketEvidence,
  ScoredComparable,
} from "../types";
import { buildSearchQueries } from "./queries";
import { validateCandidates } from "./validate";

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
 * Placeholder for live marketplace APIs. Do not synthesize comparables.
 */
async function retrieveCandidates(
  item: IdentifiedItem,
  searchQueries: string[],
): Promise<CandidateListing[]> {
  void item;
  void searchQueries;
  return [];
}

/** Round prices, force NZD, attach scores, sort ascending for median pricing. */
function normalizeComparables(
  validated: Array<
    CandidateListing & { variantMatch: number; freshness: number }
  >,
): ScoredComparable[] {
  return validated
    .filter((c) => Boolean(c.url))
    .map((c) => ({
      title: c.title.trim(),
      price: Math.round(c.price),
      currency: "NZD",
      source: c.source,
      url: c.url as string,
      variantMatch: c.variantMatch,
      freshness: c.freshness,
    }))
    .sort((a, b) => a.price - b.price);
}
