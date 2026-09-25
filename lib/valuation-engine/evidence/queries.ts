import type { IdentifiedItem } from "../types";

/** Build NZ-focused used-goods search queries from identification. */
export function buildSearchQueries(item: IdentifiedItem): string[] {
  const { brand, model, name, attributes } = item.item;
  const parts = [brand, model].filter(Boolean);
  const base = parts.length > 0 ? parts.join(" ") : name;

  const knownAttrs = Object.entries(attributes)
    .filter(([, v]) => v && v.toLowerCase() !== "unknown")
    .map(([, v]) => v);

  const attrSuffix = knownAttrs.join(" ");
  const core = [base, attrSuffix].filter(Boolean).join(" ").trim();

  const queries = [
    `${core} used NZ`,
    `${core} Trade Me`,
    `${base} ${attrSuffix} second hand New Zealand`.trim(),
  ];

  return [...new Set(queries.map((q) => q.replace(/\s+/g, " ").trim()))];
}
