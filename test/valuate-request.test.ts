import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../app/api/valuate/route.js";
import { ApiError, apiErrorResponse } from "../lib/api/errors.js";
import { MAX_IMAGE_BYTES, validateValuateRequest } from "../lib/validation/valuate-request.js";
import { parseImageBase64 } from "../lib/valuation-engine/ai/image.js";

const imageBase64 = "aGVsbG8=";
const valid = { imageBase64, mimeType: "image/png" };

test("accepts supported MIME types and matching data URLs", () => {
  for (const mimeType of ["image/jpeg", "image/png", "image/webp"] as const) {
    const expected = { imageBase64, mimeType };
    assert.deepEqual(validateValuateRequest(expected), expected);
    assert.deepEqual(validateValuateRequest({
      imageBase64: `data:${mimeType};base64,${imageBase64}`, mimeType,
    }), expected);
    assert.deepEqual(parseImageBase64(imageBase64, mimeType), { data: imageBase64, mimeType });
  }
});

test("rejects malformed bodies, images, MIME types and conflicting data URLs", () => {
  for (const body of [null, [], true, 42, "image"]) {
    assert.throws(() => validateValuateRequest(body), { message: "INVALID_REQUEST" });
  }
  for (const value of [undefined, null, 1, "", " ", "aGVsbG8", "aGVsbG8===", "aGVs\nbG8=", "aGVsbG8_", "Zh==", "====", "data:image/gif;base64,aGVsbG8="]) {
    assert.throws(() => validateValuateRequest({ ...valid, imageBase64: value }), { message: "INVALID_IMAGE" });
  }
  for (const mimeType of [undefined, null, 1, "image/gif", "image/svg+xml"]) {
    assert.throws(() => validateValuateRequest({ ...valid, mimeType }), { message: "INVALID_MIME_TYPE" });
  }
  assert.throws(() => validateValuateRequest({ ...valid, imageBase64: `data:image/jpeg;base64,${imageBase64}` }), { message: "INVALID_MIME_TYPE" });
});

test("enforces exact decoded 3,000,000-byte boundary, including data URL overhead", () => {
  const maximum = Buffer.alloc(MAX_IMAGE_BYTES).toString("base64");
  assert.equal(validateValuateRequest({ ...valid, imageBase64: maximum }).imageBase64, maximum);
  assert.equal(validateValuateRequest({ ...valid, imageBase64: `data:image/png;base64,${maximum}` }).imageBase64, maximum);
  for (const size of [MAX_IMAGE_BYTES + 1, MAX_IMAGE_BYTES + 3]) {
    assert.throws(() => validateValuateRequest({ ...valid, imageBase64: Buffer.alloc(size).toString("base64") }), { message: "IMAGE_TOO_LARGE" });
  }
});

test("error responses use stable codes without leaking arbitrary error messages", async () => {
  for (const error of [new Error("Gemini API key secret"), new SyntaxError("upstream JSON secret"), new Error("IMAGE_TOO_LARGE")]) {
    const response = apiErrorResponse(error);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "Unable to complete valuation", code: "VALUATION_FAILED" });
  }
  assert.equal(apiErrorResponse(new ApiError("IMAGE_TOO_LARGE")).status, 413);
  assert.equal(apiErrorResponse(new ApiError("INSUFFICIENT_EVIDENCE")).status, 422);
});

test("POST rejects invalid requests before calling the engine", async () => {
  for (const [body, status, code] of [
    ["{", 400, "INVALID_REQUEST"],
    ["null", 400, "INVALID_REQUEST"],
    [JSON.stringify({ imageBase64 }), 400, "INVALID_MIME_TYPE"],
    [JSON.stringify({ ...valid, imageBase64: "bad!" }), 400, "INVALID_IMAGE"],
    [JSON.stringify({ ...valid, imageBase64: Buffer.alloc(MAX_IMAGE_BYTES + 1).toString("base64") }), 413, "IMAGE_TOO_LARGE"],
  ] as const) {
    const response = await POST(new NextRequest("http://localhost/api/valuate", { method: "POST", body }));
    assert.equal(response.status, status);
    const json = await response.json();
    assert.equal(json.code, code);
  }
});

