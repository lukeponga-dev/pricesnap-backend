import assert from "node:assert/strict";
import { test } from "node:test";
import { runEngine, type EngineDependencies } from "../lib/valuation-engine/index.js";
import { groundedCandidates } from "../lib/valuation-engine/evidence/index.js";
import { connectionStatus } from "../lib/api/connection.js";
import { createValuateHandler } from "../lib/api/valuate.js";
import type { GroundingMetadata } from "@google/genai";

const identified = {
  item: { name: "iPhone 13 Pro", category: "phone", attributes: {} },
  condition: { grade: "Good", score: 80, notes: [] }, identificationConfidence: 0.9,
};
const deps: EngineDependencies = {
  identify: async () => identified,
  evidence: async () => ({ searchQueries: [], comparables: [500, 600].map((price, i) => ({
    title: "iPhone 13 Pro", price, currency: "NZD", source: "Trade Me",
    url: `https://www.trademe.co.nz/a/marketplace/listing/${i}`,
    variantMatch: 0.9, freshness: 0.55,
  })) }),
};
test("internal pipeline preserves Android contract and accepts image alias", async () => {
  const handler = createValuateHandler((data, mime, options) => {
    assert.equal(data, "aGVsbG8="); assert.equal(mime, "image/jpeg");
    return runEngine(data, mime, options, deps);
  });
  const response = await handler(new Request("https://backend.test/api/valuate", {
    method: "POST", body: JSON.stringify({ image: "aGVsbG8=" }),
  }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, "success");
  assert.equal(result.valuation.estimatedValue, 550);
  assert.equal(result.condition.score, 80);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("zero or one comparable never produces a price", async () => {
  for (const count of [0, 1]) {
    const result = await runEngine("image", "image/jpeg", {}, { ...deps,
      evidence: async (...args) => ({ ...await deps.evidence(...args), comparables: (await deps.evidence(...args)).comparables.slice(0, count) }),
    });
    assert.equal(result.status, "insufficient_evidence");
    assert.deepEqual(result.valuation, { currency: "NZD", estimatedValue: null, low: null, high: null });
    assert.deepEqual(result.confidence, { score: 0, level: "low" });
    assert.deepEqual(result.comparables, []);
  }
});
test("uncertain identity, provider errors and aborts use safe codes", async () => {
  await assert.rejects(runEngine("x", "image/jpeg", {}, { ...deps, identify: async () => ({ ...identified, identificationConfidence: 0.1 }) }), { message: "IDENTIFICATION_UNCERTAIN" });
  for (const [status, message] of [[429, "PROVIDER_RATE_LIMIT"], [404, "PROVIDER_MODEL_UNAVAILABLE"], [403, "SERVICE_NOT_CONFIGURED"], [500, "VALUATION_FAILED"]] as const) {
    await assert.rejects(runEngine("x", "image/jpeg", {}, { ...deps, identify: async () => { throw { status, message: "secret" }; } }), { message });
  }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runEngine("x", "image/jpeg", { signal: controller.signal }, deps), { message: "ANALYSIS_TIMEOUT" });
});
test("candidates require a cited quote with exact title, explicit NZD price and a grounded URL", () => {
  const quote = "Used iPhone 13 Pro NZD 600";
  const grounding: GroundingMetadata = {
    groundingChunks: [{ web: { uri: "https://www.trademe.co.nz/listing/1", title: "Trade Me" } }],
    groundingSupports: [{ segment: { text: quote }, groundingChunkIndices: [0] }],
  };
  const row = { title: "iPhone 13 Pro", price: 600, currency: "NZD", quote, sourceIndex: 0 };
  assert.equal(groundedCandidates([row, row], grounding).length, 1);
  for (const invalid of [{ ...row, currency: "AUD" }, { ...row, price: 900 }, { ...row, sourceIndex: 1 }, { ...row, quote: "iPhone 13 Pro NZD 900" }, { ...row, title: "Samsung" }]) {
    assert.deepEqual(groundedCandidates([invalid], grounding), []);
  }
  assert.deepEqual(groundedCandidates([row]), []);
});
test("diagnostics report configuration without claiming a live provider check", () => {
  const previous = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    assert.equal(connectionStatus().ok, false);
    process.env.GEMINI_API_KEY = "test-only";
    const status = connectionStatus();
    assert.equal(status.engine.hasApiKey, true);
    assert.equal(status.engine.providerChecked, false);
    assert.equal(status.engine.geminiLatencyMs, null);
    assert.equal(typeof status.engine.visionModel, "string");
    assert.equal(typeof status.engine.evidenceModel, "string");
    assert.equal("upstream" in status, false);
    assert.ok(!JSON.stringify(status).includes("test-only"));
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
});
