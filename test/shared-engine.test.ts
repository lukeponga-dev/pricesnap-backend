import assert from "node:assert/strict";
import { test } from "node:test";
import { createValuateHandler } from "../lib/api/valuate.js";
import { DEFAULT_ENGINE_URL, valuateImage } from "../lib/valuation-engine/index.js";

const image = "aGVsbG8=";
function fixture() {
  return {
    ok: true, status: "success", date: "2026-09-28T12:00:00.000Z",
    product: {
      name: "iPhone 13 Pro", category: "phone", brand: "Apple", modelVariant: "256GB",
      condition: { score: 8, grade: "A", defects: ["Small scratch"], issues: [], summary: "Used" },
    },
    valuation: { currency: "NZD", estimatedValue: 600, lowEstimate: 500, highEstimate: 700 },
    confidence: { score: 0.7, level: "MODERATE" },
    evidence: { filteredCount: 1, sources: [{
      title: "iPhone 13 Pro 256GB", priceNZD: 600, originalCurrency: "NZD",
      platform: "Trade Me", url: "https://www.trademe.co.nz/a/marketplace/listing/123",
    }] },
    warnings: ["Asking prices are not completed sales."],
  };
}

function transport(payload: unknown, status = 200): typeof fetch {
  return async () => Response.json(payload, { status });
}

test("route sends the actual normalized image to pricesnapai and maps Android fields", async () => {
  let calls = 0;
  const handler = createValuateHandler((data, mime, options) =>
    valuateImage(data, mime, options, async (url, init) => {
      calls++;
      assert.equal(String(url), DEFAULT_ENGINE_URL);
      assert.equal(init?.method, "POST");
      assert.equal(init?.cache, "no-store");
      assert.equal(init?.redirect, "error");
      assert.deepEqual(JSON.parse(String(init?.body)), { image: "data:image/png;base64,aGVsbG8=" });
      return Response.json(fixture());
    }));
  const response = await handler(new Request("https://pricesnap-server.vercel.app/api/valuate", {
    method: "POST", body: JSON.stringify({ imageBase64: "data:image/png;base64," + image, mimeType: "image/png" }),
  }));
  assert.equal(calls, 1);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const body = await response.json();
  assert.equal(body.item.name, "iPhone 13 Pro");
  assert.equal(body.condition.score, 80);
  assert.deepEqual(body.valuation, { currency: "NZD", estimatedValue: 600, low: 500, high: 700 });
  assert.deepEqual(body.confidence, { score: 0.7, level: "medium" });
  assert.equal(body.comparables[0].price, 600);
  assert.equal(body.status, "success");
});

test("insufficient evidence is HTTP 200 with null prices and no stale comparables or confidence", async () => {
  const upstream = { ...fixture(), status: "insufficient_evidence" };
  const handler = createValuateHandler((data, mime, options) => valuateImage(data, mime, options, transport(upstream)));
  const response = await handler(new Request("https://backend.test/api/valuate", {
    method: "POST", body: JSON.stringify({ imageBase64: image, mimeType: "image/png" }),
  }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "insufficient_evidence");
  assert.deepEqual(body.valuation, { currency: "NZD", estimatedValue: null, low: null, high: null });
  assert.deepEqual(body.confidence, { score: 0, level: "low" });
  assert.deepEqual(body.comparables, []);
});

test("malformed, mock, unbacked or non-NZD successful responses fail closed", async () => {
  const bad: unknown[] = [null, {}, { ...fixture(), isMock: true }, { ...fixture(), ok: false }];
  for (const alter of [
    (v: ReturnType<typeof fixture>) => { v.evidence.sources = []; v.evidence.filteredCount = 0; },
    (v: ReturnType<typeof fixture>) => { v.evidence.sources[0].originalCurrency = "USD"; },
    (v: ReturnType<typeof fixture>) => { v.evidence.sources[0].priceNZD = -1; },
    (v: ReturnType<typeof fixture>) => { v.evidence.sources[0].url = "javascript:alert(1)"; },
    (v: ReturnType<typeof fixture>) => { v.evidence.filteredCount = 2; },
    (v: ReturnType<typeof fixture>) => { v.valuation.currency = "USD"; },
    (v: ReturnType<typeof fixture>) => { v.valuation.lowEstimate = 700; },
    (v: ReturnType<typeof fixture>) => { v.valuation.estimatedValue = 0; },
    (v: ReturnType<typeof fixture>) => { v.confidence.score = 10; },
    (v: ReturnType<typeof fixture>) => { v.confidence.level = "toString"; },
  ]) {
    const value = fixture(); alter(value); bad.push(value);
  }
  for (const payload of bad) {
    await assert.rejects(valuateImage(image, "image/png", {}, transport(payload)), { message: "VALUATION_FAILED" });
  }
});

test("upstream failures preserve actionable codes without leaking messages or retrying", async () => {
  for (const [status, code] of [[429, "PROVIDER_RATE_LIMIT"], [503, "SERVICE_NOT_CONFIGURED"],
    [504, "ANALYSIS_TIMEOUT"], [422, "IDENTIFICATION_UNCERTAIN"], [413, "IMAGE_TOO_LARGE"],
    [400, "INVALID_IMAGE"], [502, "INVALID_AI_RESPONSE"]] as const) {
    let calls = 0;
    const handler = createValuateHandler((data, mime, options) => valuateImage(data, mime, options, async () => {
      calls++; return Response.json({ error: code, message: "private provider details" }, { status });
    }));
    const response = await handler(new Request("https://backend.test/api/valuate", {
      method: "POST", body: JSON.stringify({ imageBase64: image, mimeType: "image/png" }),
    }));
    const body = await response.json();
    assert.equal(response.status, status);
    assert.equal(body.code, status === 502 ? "VALUATION_FAILED" : code);
    assert.ok(!JSON.stringify(body).includes("private"));
    assert.equal(calls, 1);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});

test("HTML responses and network failures become safe errors", async () => {
  for (const fetcher of [
    async () => new Response("<html>deployment unavailable</html>"),
    async () => { throw new Error("secret transport details"); },
  ]) {
    await assert.rejects(valuateImage(image, "image/png", {}, fetcher), { message: "VALUATION_FAILED" });
  }
});

test("client cancellation aborts the upstream request", async () => {
  const controller = new AbortController();
  const promise = valuateImage(image, "image/png", { signal: controller.signal }, async (_url, init) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  });
  controller.abort();
  await assert.rejects(promise, { message: "ANALYSIS_TIMEOUT" });
});

test("a stalled upstream is aborted at the configured deadline", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let aborted = false;
  const promise = valuateImage(image, "image/png", {}, async (_url, init) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); });
    });
  });
  t.mock.timers.tick(95_000);
  await assert.rejects(promise, { message: "ANALYSIS_TIMEOUT" });
  assert.equal(aborted, true);
});

test("rejects self-proxy loops and unsafe configured upstream URLs before sending photos", async () => {
  await assert.rejects(valuateImage(image, "image/png", { requestUrl: DEFAULT_ENGINE_URL }), { message: "SERVICE_NOT_CONFIGURED" });
  const before = process.env.PRICESNAP_ENGINE_URL;
  try {
    for (const url of ["bad", "http://example.test/api/analyze", "https://user:password@example.test/api/analyze"]) {
      process.env.PRICESNAP_ENGINE_URL = url;
      await assert.rejects(valuateImage(image, "image/png"), { message: "SERVICE_NOT_CONFIGURED" });
    }
  } finally {
    if (before === undefined) delete process.env.PRICESNAP_ENGINE_URL;
    else process.env.PRICESNAP_ENGINE_URL = before;
  }
});
