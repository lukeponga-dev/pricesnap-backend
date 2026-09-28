/**
 * Deterministic candidate filters — the “trust” layer for market evidence.
 *
 * Not every search hit is a fair comparable. We reject or down-weight:
 * accessories, broken/parts, sealed retail, foreign currency, and weak
 * variant matches (e.g. wrong iPhone storage). Survivors get variantMatch
 * + freshness scores consumed by the confidence engine.
 */
import type { CandidateListing, IdentifiedItem } from "../types";
import { clamp } from "../ai/parse-json";

/** Titles that look like accessory-only listings rather than the main item. */
const ACCESSORY_TERMS = [
  "case",
  "cover",
  "charger",
  "cable",
  "screen protector",
  "box only",
  "empty box",
  "tempered glass",
  "earpod",
  "earpods",
  "airpod",
  "airpods",
  "watch band",
];

/** Non-working / parts-only listings skew prices downward. */
const BROKEN_RE =
  /\b(broken|faulty|spares?|parts?\s*only|for\s*parts|cracked\s*screen|water\s*damage|not\s*working|dead)\b/i;

/** Sealed / BNIB stock is not a used-resale comparable. */
const NEW_RETAIL_RE =
  /\b(brand\s*new\s*sealed|sealed\s*box|retail\s*new|BNIB|new\s*in\s*box)\b/i;

const INTL_CURRENCY_RE = /\b(USD|AUD|GBP|EUR|\$US)\b/i;

/** Minimum variantMatch required to keep a candidate. */
const MIN_VARIANT_MATCH = 0.35;

/**
 * Filter and score raw candidates. Returns only listings safe to price on.
 */
export function validateCandidates(
  item: IdentifiedItem,
  candidates: CandidateListing[],
): Array<CandidateListing & { variantMatch: number; freshness: number }> {
  const results = [];

  for (const candidate of candidates) {
    const title = candidate.title ?? "";
    const titleLower = title.toLowerCase();

    const identity = item.item.model || item.item.name;
    if (!containsTokens(titleLower, identity.toLowerCase())) continue;
    if (item.item.attributes.storage && looksLikeConflictingStorage(titleLower, item.item.attributes.storage)) continue;
    if (isAccessoryOnlyListing(item, titleLower)) continue;
    if (BROKEN_RE.test(title)) continue;
    if (NEW_RETAIL_RE.test(title)) continue;
    if (candidate.currency !== "NZD") {
      continue;
    }
    if (INTL_CURRENCY_RE.test(title)) continue;
    if (!Number.isFinite(candidate.price) || candidate.price <= 0) continue;

    const variantMatch = scoreVariantMatch(item, titleLower);
    if (variantMatch < MIN_VARIANT_MATCH) continue;

    const freshness = scoreFreshness(candidate.listedAt);

    results.push({
      ...candidate,
      currency: "NZD",
      variantMatch,
      freshness,
    });
  }

  return results;
}

function isAccessoryOnlyListing(
  item: IdentifiedItem,
  titleLower: string,
): boolean {
  const targetText = [
    item.item.name,
    item.item.category,
    item.item.brand,
    item.item.model,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const targetIsAccessory = ACCESSORY_TERMS.some((term) =>
    targetText.includes(term),
  );
  if (targetIsAccessory) return false;

  const hasAccessoryTerm = ACCESSORY_TERMS.some((term) =>
    titleLower.includes(term),
  );
  if (!hasAccessoryTerm) return false;

  const knownAttributeValues = Object.values(item.item.attributes).filter(
    (value) => value && !["unknown", "n/a", "unsure"].includes(value.toLowerCase()),
  );
  const hasKnownAttribute =
    knownAttributeValues.length === 0 ||
    knownAttributeValues.some((value) =>
      titleLower.replace(/\s+/g, "").includes(value.toLowerCase().replace(/\s+/g, "")),
    );

  if (!hasKnownAttribute) return true;

  return scoreVariantMatch(item, titleLower) < 0.65;
}

/**
 * Heuristic overlap between identified item and listing title.
 * Requires identity overlap and scores brand/model/attribute hits or conflicts.
 */
function scoreVariantMatch(item: IdentifiedItem, titleLower: string): number {
  let score = 0;

  const model = item.item.model?.toLowerCase();
  const brand = item.item.brand?.toLowerCase();
  const name = item.item.name.toLowerCase();

  if (model && titleLower.includes(model.toLowerCase())) score += 0.6;
  else if (name && containsTokens(titleLower, name)) score += 0.5;

  if (brand && titleLower.includes(brand)) score += 0.1;

  for (const [key, value] of Object.entries(item.item.attributes)) {
    if (!value || value.toLowerCase() === "unknown") continue;

    const normalized = value.toLowerCase().replace(/\s+/g, "");
    const titleNorm = titleLower.replace(/\s+/g, "");

    if (
      titleNorm.includes(normalized) ||
      titleLower.includes(value.toLowerCase())
    ) {
      score += 0.12;
    } else if (
      key === "storage" &&
      looksLikeConflictingStorage(titleLower, value)
    ) {
      // e.g. identified 256GB but title only mentions 128GB
      score -= 0.4;
    }
  }

  return clamp(score, 0, 1);
}

/** True when every meaningful token of `phrase` appears in `haystack`. */
function containsTokens(haystack: string, phrase: string): boolean {
  const tokens = phrase.split(/\s+/).filter((t) => t.length > 2);
  if (tokens.length === 0) return false;
  return tokens.every((t) => haystack.includes(t));
}

/**
 * True when the title states a storage size that disagrees with identification.
 * Titles with no storage mentioned are not treated as conflicts.
 */
function looksLikeConflictingStorage(title: string, expected: string): boolean {
  const storages = title.match(/\b(\d+)\s?(gb|tb)\b/gi);
  if (!storages) return false;

  const expectedNorm = expected.toLowerCase().replace(/\s+/g, "");
  return !storages.some(
    (s) => s.toLowerCase().replace(/\s+/g, "") === expectedNorm,
  );
}

/**
 * Fresher listings score higher. Missing/unparseable dates get a neutral mid score
 * so they neither inflate nor tank confidence alone.
 */
function scoreFreshness(listedAt: string | undefined): number {
  if (!listedAt) return 0.55;

  const listed = Date.parse(listedAt);
  if (Number.isNaN(listed)) return 0.55;

  const ageDays = (Date.now() - listed) / (1000 * 60 * 60 * 24);
  if (ageDays <= 14) return 1;
  if (ageDays <= 45) return 0.8;
  if (ageDays <= 90) return 0.55;
  if (ageDays <= 180) return 0.35;
  return 0.2;
}

