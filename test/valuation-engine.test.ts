import assert from "node:assert/strict";
import { test } from "node:test";

import { validateCandidates } from "../lib/valuation-engine/evidence/validate.js";
import { buildSearchQueries } from "../lib/valuation-engine/evidence/queries.js";
import { normalizeValue } from "../lib/valuation-engine/identification/index.js";
import { calculateValuation } from "../lib/valuation-engine/pricing/index.js";
import type { IdentifiedItem, ScoredComparable } from "../lib/valuation-engine/types.js";

const item: IdentifiedItem = {
  item: {
    name: "iPhone 13 Pro",
    brand: "Apple",
    model: "iPhone 13 Pro",
    category: "phone",
    attributes: { storage: "256GB" },
  },
  condition: { grade: "Good", score: 80, notes: [] },
  identificationConfidence: 0.9,
};

test("market valuation uses median and marks market evidence", () => {
  const valuation = calculateValuation([
    comparable("A", 700),
    comparable("B", 600),
    comparable("C", 500),
  ]);

  assert.deepEqual(valuation, {
    currency: "NZD",
    estimatedValue: 600,
    low: 510,
    high: 690,
  });
});

test("empty evidence cannot produce a synthetic price", () => {
  assert.throws(() => calculateValuation([]), /Insufficient market evidence/);
});

test("unknown-like values normalize to absence", () => {
  assert.equal(normalizeValue("Unknown"), undefined);
  assert.equal(normalizeValue(" n/a "), undefined);
  assert.equal(normalizeValue("Unsure"), undefined);
  assert.equal(normalizeValue("256GB"), "256GB");
});

test("query construction omits unknown-like attributes", () => {
  const queries = buildSearchQueries({
    ...item,
    item: {
      ...item.item,
      attributes: { storage: "256GB", colour: "n/a" },
    },
  });

  assert.ok(queries.every((query) => !query.toLowerCase().includes("n/a")));
  assert.ok(queries.some((query) => query.includes("256GB")));
});

test("brand-only recognition retains the item name in every search query", () => {
  const queries = buildSearchQueries({
    ...item,
    item: { name: "Xbox Controller", brand: "Xbox", category: "Gaming Accessories", attributes: {} },
  });
  assert.ok(queries.every(query => query.includes("Xbox Controller")));
  assert.ok(queries.every(query => !query.includes("Xbox Xbox")));
  assert.ok(queries.some(query => query.includes("site:trademe.co.nz")));
});

test("queries preserve model and include an alternative without cosmetic attributes", () => {
  const queries = buildSearchQueries({
    ...item,
    item: { ...item.item, attributes: { colour: "silver", storage: "256GB" } },
  });
  assert.ok(queries.every(query => query.includes("iPhone 13 Pro")));
  assert.ok(queries.some(query => query.includes("256GB")));
  assert.ok(queries.some(query => !query.includes("silver")));
});

test("candidate filtering is item-aware for accessories", () => {
  const candidates = validateCandidates(item, [
    listing("iPhone 13 Pro 256GB with case", 650),
    listing("iPhone 13 Pro leather case", 25),
  ]);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].title, "iPhone 13 Pro 256GB with case");
});

test("candidate filtering allows accessories when target item is an accessory", () => {
  const candidates = validateCandidates(
    {
      ...item,
      item: {
        name: "iPhone 13 Pro leather case",
        brand: "Apple",
        model: "iPhone 13 Pro",
        category: "phone case",
        attributes: {},
      },
    },
    [listing("Apple iPhone 13 Pro leather case", 25)],
  );

  assert.equal(candidates.length, 1);
});

function comparable(title: string, price: number): ScoredComparable {
  return {
    title,
    price,
    currency: "NZD",
    source: "Trade Me",
    url: "https://example.test/listing",
    variantMatch: 0.9,
    freshness: 0.9,
  };
}

function listing(title: string, price: number) {
  return {
    title,
    price,
    currency: "NZD",
    source: "Trade Me",
    url: "https://example.test/listing",
  };
}



test("rejects missing currency, unrelated products and conflicting storage", () => {
  assert.deepEqual(validateCandidates(item, [
    { ...listing("iPhone 13 Pro 256GB", 600), currency: "" },
    listing("Samsung Galaxy 256GB", 600),
    listing("iPhone 13 Pro 128GB", 600),
  ]), []);
});
