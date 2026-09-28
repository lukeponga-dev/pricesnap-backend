import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const [file, base = "http://localhost:3000"] = process.argv.slice(2);
if (!file) throw new Error("Usage: npm run smoke:live -- /path/to/item.jpg [backend origin]");
const mimeType = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[extname(file).toLowerCase()];
if (!mimeType) throw new Error("Use a JPEG, PNG or WebP photo.");
const bytes = await readFile(file);
if (!bytes.length || bytes.length > 3_000_000) throw new Error("Image must be between 1 and 3,000,000 bytes.");
const response = await fetch(new URL("/api/valuate", base), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ imageBase64: bytes.toString("base64"), mimeType }),
  signal: AbortSignal.timeout(120_000),
});
const result = await response.json();
if (!response.ok) throw new Error("Valuation failed: HTTP " + response.status + " " + result.code);
assert.equal(result.ok, true);
assert.equal(result.valuation.currency, "NZD");
assert.ok(["success", "insufficient_evidence"].includes(result.status));
if (result.status === "insufficient_evidence") {
  assert.equal(result.valuation.estimatedValue, null);
  assert.equal(result.valuation.low, null);
  assert.equal(result.valuation.high, null);
  assert.equal(result.confidence.score, 0);
  assert.equal(result.comparables.length, 0);
} else {
  assert.ok(result.valuation.estimatedValue > 0);
  assert.ok(result.valuation.low > 0 && result.valuation.low <= result.valuation.estimatedValue);
  assert.ok(result.valuation.high >= result.valuation.estimatedValue);
  assert.ok(result.comparables.length > 0);
  assert.ok(result.comparables.every(c => c.currency === "NZD" && c.price > 0 && /^https?:\/\//.test(c.url)));
}
console.log(JSON.stringify(result, null, 2));
console.log("Contract passed. Inspect item identity, listing relevance, currency and prices manually.");
