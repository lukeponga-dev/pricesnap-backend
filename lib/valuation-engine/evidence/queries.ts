/**
 * Search-query construction for market evidence.
 *
 * Builds NZ-focused used-goods strings from brand/model/attributes.
 * Omits attributes marked "Unknown" so we don't poison Trade Me-style searches.
 */
import type { IdentifiedItem } from "../types";

/**
 * Example: Apple iPhone 13 Pro + 256GB → "Apple iPhone 13 Pro 256GB used NZ"
 */
export function buildSearchQueries(item: IdentifiedItem): string[] {
  const { brand, model, name, attributes } = item.item;

  // Prefer brand + model; fall back to free-text name when either is missing.
  const parts = [brand, model].filter(Boolean);
  const base = parts.length > 0 ? parts.join(" ") : name;

  const knownAttrs = Object.entries(attributes)
    .filter(([, v]) => v && !["unknown", "n/a", "unsure"].includes(v.toLowerCase()))
    .map(([, v]) => v);

  const attrSuffix = knownAttrs.join(" ");
  const core = [base, attrSuffix].filter(Boolean).join(" ").trim();

  const queries = [
    `${core} used NZ`,
    `${core} Trade Me`,
    `${base} ${attrSuffix} second hand New Zealand`.trim(),
  ];

  // De-dupe after whitespace normalization.
  return [...new Set(queries.map((q) => q.replace(/\s+/g, " ").trim()))];
}
