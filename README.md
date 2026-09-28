# PriceSnap Backend

Android compatibility API for the shared **pricesnapai valuation engine**.
The web app calls that engine directly; this backend forwards Android images to
the same service and maps its result to the existing `item`, `condition`,
`valuation`, `confidence` and `comparables` fields.

## Configuration

Node.js 20.9+ and npm are required.

```bash
npm ci
npm run dev
```

Optional server environment variable:

```dotenv
PRICESNAP_ENGINE_URL=https://pricesnapai.vercel.app/api/analyze
```

This is already the default. Use an HTTPS endpoint exposing the pricesnap
`/api/analyze` contract. Do not point it at this backend: same-origin forwarding
is rejected to avoid a request loop. Redirects are not followed.

The **pricesnapai Vercel project** owns the Gemini API key, model configuration,
Google Search grounding, evidence filtering and pricing. A Gemini key on this
compatibility backend does not configure the remote engine. The older local
identification/evidence/pricing helpers are not used by the API; the fabricated
condition-based price fallback has been removed.

## POST /api/valuate

```json
{ "imageBase64": "<base64 image>", "mimeType": "image/jpeg" }
```

Send JPEG, PNG or WebP, standard padded Base64 without whitespace, or a matching
data URL. The decoded limit is **3,000,000 bytes**, matching the shared engine.
Compress large camera photos before uploading. Validation checks Base64 and MIME
consistency; the upstream engine also checks image signatures.

Android should send the real MIME type and use `Base64.NO_WRAP` with padding.
The adapter sends one image data URL to the shared engine. Responses and upstream
fetches use `Cache-Control: no-store` / `cache: no-store`. The backend does not
persist photos or log their contents.

### Results

- `ok: true, status: "success"`: a positive NZD value with usable comparables.
- `ok: true, status: "insufficient_evidence"`: HTTP 200, null
  `valuation.estimatedValue`, `valuation.low`, and `valuation.high`, no comparables,
  and zero valuation confidence. This is not a zero-dollar valuation.
- `condition.score` uses the existing 0–100 scale (converted from the engine's 0–10).
- `confidence.level` is `low`, `medium`, or `high`; `score` is 0–1.
- `warnings` retains the engine's limitations. `generatedAt` is its result timestamp.

The adapter requires successful responses to contain positive comparable prices,
explicit original NZD currency, listing URLs, and a consistent price range. It
does not independently scrape or verify listings; grounding and relevance remain
the responsibility of the shared engine. No prices are synthesized here.

Android price DTO fields must be nullable:

```kotlin
data class Valuation(
    val currency: String,
    val estimatedValue: Double?,
    val low: Double?,
    val high: Double?
)
```

Check `status` and nullable values before formatting prices. Display “Not enough
market evidence” for insufficient evidence. The Android repository/UI is separate
and is not changed by this backend PR.

### Errors

Errors retain the shape `{ "error": "Safe message", "code": "STABLE_CODE" }`.

| Code | HTTP status |
| --- | --- |
| INVALID_REQUEST, INVALID_IMAGE, INVALID_MIME_TYPE | 400 |
| IMAGE_TOO_LARGE | 413 |
| IDENTIFICATION_UNCERTAIN | 422 |
| PROVIDER_RATE_LIMIT | 429 |
| VALUATION_FAILED | 502 |
| SERVICE_NOT_CONFIGURED | 503 |
| ANALYSIS_TIMEOUT | 504 |

There is no automatic retry that could duplicate provider work. The upstream
request is cancelled when the client aborts or after 95 seconds; the Next.js
route requests a 120-second platform duration. Configure Android's call/read
timeout to allow this duration. Raw upstream messages are not exposed.

## Verification and deployment

```bash
npm test
npm run lint
npm run build
npm run start
# In another terminal, using a real item photo you are authorized to upload:
npm run smoke:live -- /path/to/item.jpg http://localhost:3000
# After deployment:
npm run smoke:live -- /path/to/item.jpg https://pricesnap-server.vercel.app
```

The smoke command makes one real valuation request and prints the returned
evidence for manual inspection. It may consume upstream Gemini/Search quota.
An insufficient-evidence result is a valid unpriced outcome, not confirmation
that market pricing works for the photographed item.

Deploy this repository's reviewed changes to the Vercel project serving
`pricesnap-server.vercel.app`. The default target needs no new environment
variable. Check that the pricesnapai project has its server-side Gemini key.

`GET /api/ping` on this backend is liveness only. The shared engine's
`https://pricesnapai.vercel.app/api/health` reports configuration presence,
not recognition accuracy, quota availability or live listing coverage.

## GET /api/connection

This endpoint provides a consolidated health check combining both this backend's status and the upstream valuation engine's status. It's useful for frontend clients to display connection health.

### Results

```json
{
  "ok": true,
  "timestamp": 1700000000000,
  "backend": {
    "status": "online",
    "service": "pricesnap-backend",
    "version": "0.1.0"
  },
  "upstream": {
    "connected": true,
    "status": "online",
    "latencyMs": 142
  }
}
```

Deterministic tests use controlled upstream responses and do not establish
live provider acceptance. Authentication and rate limiting remain separate
production-hardening work.
