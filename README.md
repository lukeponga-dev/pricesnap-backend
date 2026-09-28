# PriceSnap Backend — internal valuation engine

Android → `POST /api/valuate` → Gemini identification → Google Search evidence → deterministic NZD pricing.

Recognition, visual condition, comparable retrieval, evidence filtering, pricing and confidence now run inside this backend. There is no forwarding to pricesnapai and no upstream health request. Existing local helpers have been reactivated with grounded retrieval; this is not a byte-for-byte copy of the pricesnapai engine.

## Configuration

Node.js 20.9+ and npm:

```bash
npm ci
# Copy .env.example to .env.local and set the server-side key.
npm run dev
```

Set these on the Vercel project serving `pricesnap-server.vercel.app`:

```dotenv
GEMINI_API_KEY=your-server-side-key
GEMINI_MODEL=gemini-flash-latest
```

`GEMINI_MODEL` is optional and must support images and Google Search grounding. The existing `@google/genai` SDK is used. Never put the Gemini key in Android, frontend code or Git. Remove `PRICESNAP_ENGINE_URL`; it is no longer read. A key configured on pricesnapai does not configure this backend.

## Android API

The existing request stays supported:

```json
{ "imageBase64": "<base64 image>", "mimeType": "image/jpeg" }
```

Also accepts `{ "image": "<base64 image>" }` (JPEG by default) or an image data URL. Use JPEG, PNG or WebP with the correct MIME type. Standard padded Base64, no whitespace; decoded maximum 3,000,000 bytes. Compress camera images before upload. Base64/MIME validation runs locally; Gemini rejects undecodable image contents.

Responses retain `item`, `condition`, `valuation`, `confidence`, `comparables`, `warnings`, `generatedAt`, `ok` and `status`. Condition is 0–100; confidence is 0–1 with low/medium/high levels.

- `success`: at least two distinct cited NZD comparables; median price and a heuristic ±15% band.
- `insufficient_evidence`: HTTP 200, null `estimatedValue`, `low`, `high`; empty comparables and zero confidence. Never display these as zero dollars.

Android's three price fields must be nullable `Double?`. Existing endpoint and normal request fields do not change; client compatibility still requires handling the existing nullable result contract. This repository does not verify or modify the Android UI.

## Evidence pipeline and limitations

`lib/valuation-engine/index.ts` exports `runEngine` (also `valuateImage`). It orchestrates:

1. Vision identification and visible condition using structured JSON.
2. Google Search research for used listings of the identified item/variant.
3. JSON extraction of exact cited statements containing the listing title and explicit NZD/NZ$ price.
4. Checks that quotes occur in grounded segments linked to the source index. URLs come from grounding metadata, never invented extraction fields. Missing currency, unsupported quotes, duplicate URLs, weak identity matches and unsuitable listings are rejected.
5. Median pricing and evidence-based confidence. No synthetic price fallback.

Grounding is evidence from Google's model/search response, not independent scraping or verification of a listing page. Indexed prices may be stale and model statements may still be wrong. Unknown dates receive reduced freshness credit. Public marketplace coverage can be incomplete, particularly Facebook Marketplace. Asking prices are not completed sales; the range is not a statistical confidence interval. Strict filters may return no valuation.

Marketplace recommendations are not part of the existing Android response contract and are not introduced by this migration.

## Diagnostics

`GET /api/ping` remains backend liveness. `GET /api/connection` checks local configuration without spending Gemini quota:

```json
{
  "ok": true,
  "timestamp": 1700000000000,
  "backend": { "status": "online", "service": "pricesnap-backend", "version": "0.1.0" },
  "engine": {
    "status": "configured",
    "service": "internal-gemini",
    "hasApiKey": true,
    "model": "gemini-flash-latest",
    "engineVersion": "internal-1.0.0",
    "geminiLatencyMs": null,
    "providerChecked": false
  }
}
```

Additional backend runtime metadata is returned. Missing key yields HTTP 503, `ok: false`, `status: "not_configured"`. A configured key does not prove it is valid or has quota. Latency is null because no Gemini request is made. The dashboard uses this new `engine` schema; other diagnostic consumers must migrate from `upstream`.

## Errors and execution

Safe errors remain `{ "error": "Safe message", "code": "STABLE_CODE" }`:

| Code | HTTP |
| --- | --- |
| INVALID_REQUEST, INVALID_IMAGE, INVALID_MIME_TYPE | 400 |
| IMAGE_TOO_LARGE | 413 |
| IDENTIFICATION_UNCERTAIN | 422 |
| PROVIDER_RATE_LIMIT | 429 |
| VALUATION_FAILED | 502 |
| SERVICE_NOT_CONFIGURED | 503 |
| ANALYSIS_TIMEOUT | 504 |

The 95-second deadline and client abort signal propagate to Gemini calls. No application retry. Node route duration is 120 seconds. Use a matching Android timeout. Responses use no-store; this backend does not persist photos or log provider messages. Google handles submitted data under the API account's terms. Authentication and rate limiting remain separate production-hardening work.

## Verification and rollout

```bash
npm test
npm run lint
npm run build
npm start
# A real photo you are authorized to upload; consumes Gemini/Search quota:
npm run smoke:live -- /path/to/item.jpg http://localhost:3000
# Repeat after deployment:
npm run smoke:live -- /path/to/item.jpg https://pricesnap-server.vercel.app
```

Before rollout: configure the backend key/model, deploy the reviewed branch, check connection configuration, then run the live smoke test and inspect listing identity, NZD price and URLs manually. An insufficient-evidence result proves the unpriced path only. Deterministic tests do not establish live-provider acceptance or price accuracy.
