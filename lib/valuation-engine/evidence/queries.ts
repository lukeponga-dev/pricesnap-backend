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

  // Brand alone is not an item identity: "Xbox Controller" must not become
  // "Xbox" when recognition cannot read a specific model number.
  const identity = model || name;
  const includesBrand = brand && identity.toLowerCase().includes(brand.toLowerCase());
  const base = [includesBrand ? undefined : brand, identity].filter(Boolean).join(" ");

  const knownAttrs = Object.entries(attributes)
    .filter(([, v]) => v && !["unknown", "n/a", "unsure"].includes(v.toLowerCase()))
    .map(([, v]) => v);

  const attrSuffix = knownAttrs.join(" ");
  const core = [base, attrSuffix].filter(Boolean).join(" ").trim();

  const queries = [
    `${core} used NZ`,
    `${core} used site:trademe.co.nz`,
    // A broader query still names the item, without optional cosmetic attributes.
    `${base} second hand New Zealand`,
  ];

  // De-dupe after whitespace normalization.
  return [...new Set(queries.map((q) => q.replace(/\s+/g, " ").trim()))];
}
