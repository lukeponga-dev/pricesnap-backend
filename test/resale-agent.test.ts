import assert from "node:assert/strict";
import { test } from "node:test";

import { createResaleHandler } from "../lib/api/resale.js";
import { createValuateHandler } from "../lib/api/valuate.js";
import { createResalePlan } from "../lib/resale-agent/index.js";
import { OpenAIListingProvider } from "../lib/resale-agent/providers.js";
import { calculateSaleStrategy } from "../lib/resale-agent/strategy.js";
import { validateResaleRequest } from "../lib/validation/resale-request.js";
import type { AppraisalResponse } from "../lib/valuation-engine/types.js";

const appraisal: AppraisalResponse = {
  ok: true,
  status: "success",
  warnings: [],
  item: { name: "Samsung Galaxy S23 128GB", brand: "Samsung", model: "Galaxy S23", category: "phone" },
  condition: { grade: "Good", score: 80, notes: ["Minor frame wear"] },
  valuation: { currency: "NZD", estimatedValue: 520, low: 450, high: 590 },
  confidence: { score: 0.87, level: "high" },
  comparables: [
    { title: "Galaxy S23", price: 500, currency: "NZD", source: "Trade Me" },
    { title: "Galaxy S23", price: 540, currency: "NZD", source: "Trade Me" },
  ],
  generatedAt: "2026-01-01T00:00:00.000Z",
};

test("sale strategy is deterministic and separate from the market valuation", () => {
  const strategy = calculateSaleStrategy(appraisal);
  assert.deepEqual(strategy, {
    currency: "NZD",
    suggestedListingPrice: 570,
    targetSalePrice: 520,
    minimumNegotiationPrice: 470,
    basis: "evidence_derived",
  });
  assert.equal(appraisal.valuation.estimatedValue, 520);
});

test("insufficient evidence never produces seller prices", async () => {
  const insufficient: AppraisalResponse = {
    ...appraisal,
    status: "insufficient_evidence",
    valuation: { currency: "NZD", estimatedValue: null, low: null, high: null },
    confidence: { score: 0, level: "low" },
    comparables: [],
  };
  const result = await createResalePlan(insufficient, {}, {
    listingProvider: { generate: async () => ({ title: "Draft", description: "Draft", provider: "deterministic" }) },
  });
  assert.equal(result.status, "insufficient_evidence");
  assert.deepEqual(result.saleStrategy, {
    currency: "NZD",
    suggestedListingPrice: null,
    targetSalePrice: null,
    minimumNegotiationPrice: null,
    basis: "insufficient_evidence",
  });
  assert.match(result.negotiationGuidance[0], /two grounded NZD comparables/);
});

test("a stalled OpenAI listing call times out and preserves the resale plan", { timeout: 1_000 }, async () => {
  let providerSignalAborted = false;
  const stalledFetch: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      providerSignalAborted = true;
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
  const provider = new OpenAIListingProvider("test-key", "test-model", 10, stalledFetch);

  const result = await createResalePlan(appraisal, {}, { listingProvider: provider });

  assert.equal(providerSignalAborted, true);
  assert.equal(result.listing.provider, "deterministic");
  assert.deepEqual(result.valuation, appraisal);
  assert.equal(result.saleStrategy.targetSalePrice, 520);
});

test("resale request validates image and bounded seller preferences", () => {
  const input = { imageBase64: "aGVsbG8=", mimeType: "image/jpeg", preferences: { marketplace: "Trade Me", notes: "Includes box" } };
  assert.deepEqual(validateResaleRequest(input), input);
  for (const preferences of [null, [], { notes: 1 }, { notes: "" }, { notes: "x".repeat(501) }, { unknown: "value" }]) {
    assert.throws(() => validateResaleRequest({ ...input, preferences }), { message: "INVALID_REQUEST" });
  }
});

test("resale endpoint validates before valuation and uses the engine result", async () => {
  let calls = 0;
  const handler = createResaleHandler(async () => { calls++; return appraisal; }, async (valuation, preferences) => ({
    ok: true, status: valuation.status, valuation,
    saleStrategy: calculateSaleStrategy(valuation),
    listing: { title: preferences?.marketplace || "Draft", description: "Draft", provider: "deterministic" },
    negotiationGuidance: [], listingChecklist: [],
  }));
  const invalid = await handler(new Request("https://backend.test/api/resale", { method: "POST", body: "{" }));
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, "INVALID_REQUEST");
  assert.equal(calls, 0);

  const response = await handler(new Request("https://backend.test/api/resale", { method: "POST", body: JSON.stringify({
    imageBase64: "aGVsbG8=", mimeType: "image/jpeg", preferences: { marketplace: "Trade Me" },
  }) }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.valuation, appraisal);
  assert.equal(body.listing.title, "Trade Me");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(calls, 1);
});

test("existing valuation endpoint response remains unchanged", async () => {
  const handler = createValuateHandler(async () => appraisal, async () => {});
  const response = await handler(new Request("https://backend.test/api/valuate", { method: "POST", body: JSON.stringify({
    imageBase64: "aGVsbG8=", mimeType: "image/jpeg",
  }) }));
  assert.deepEqual(await response.json(), appraisal);
});
