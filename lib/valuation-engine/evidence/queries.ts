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
    `${core} used`,
    `${core} used site:trademe.co.nz`,
    `${core} used site:facebook.com/marketplace`,
    `${core} second hand`,
    `${base} second hand`,
  ];

  // De-dupe after whitespace normalization.
  return [...new Set(queries.map((q) => q.replace(/\s+/g, " ").trim()))];
}

/**
 * Returns a broader set of queries by removing attributes.
 * Used when the initial specific search fails to find evidence.
 */
export function buildBroaderSearchQueries(item: IdentifiedItem): string[] {
  const { brand, model, name } = item.item;
  const identity = model || name;
  const includesBrand = brand && identity.toLowerCase().includes(brand.toLowerCase());
  const base = [includesBrand ? undefined : brand, identity].filter(Boolean).join(" ");

  const queries = [
    `${base} used`,
    `${base} used site:trademe.co.nz`,
    `${base} used site:facebook.com/marketplace`,
    `${base} second hand`,
  ];

  return [...new Set(queries.map((q) => q.replace(/\s+/g, " ").trim()))];
}

/**
 * Returns brand-specific queries for global marketplaces.
 * Used as a final fallback for rare or high-value items.
 */
export function buildGlobalMarketplaceQueries(item: IdentifiedItem): string[] {
  const { brand, model, name } = item.item;
  const identity = model || name;
  const includesBrand = brand && identity.toLowerCase().includes(brand.toLowerCase());
  const base = [includesBrand ? undefined : brand, identity].filter(Boolean).join(" ");

  const queries = [
    `${base} site:ebay.com`,
    `${base} site:stockx.com`,
    `${base} site:grailed.com`,
    `${base} resale value`,
  ];

  return [...new Set(queries.map((q) => q.replace(/\s+/g, " ").trim()))];
}
