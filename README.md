# PriceSnap Backend

> AI-assisted secondhand product valuation for the New Zealand market.

PriceSnap Backend is the server-side valuation engine powering the PriceSnap application. It analyses product images, identifies products, assesses visible condition, gathers real-world market evidence, filters comparable listings, and calculates structured resale-value estimates in **New Zealand dollars (NZD)**.

PriceSnap is designed as a **valuation system supported by AI**, rather than an AI-generated pricing service.

The AI is responsible primarily for understanding the submitted product and its visible condition. The PriceSnap backend controls market evidence, comparable filtering, pricing calculations, confidence scoring, normalization, validation, and the final API response.

---

## Core Principle

**AI understands the item. PriceSnap determines the valuation.**

AI output is treated as untrusted structured input.

No AI-generated price, confidence score, market listing, or URL is allowed to become authoritative simply because the model produced it.

The backend remains responsible for determining what evidence is usable and how the final valuation is calculated.

---

## Architecture

```text
Product Image
      │
      ▼
Input Validation
      │
      ▼
┌─────────────────────────────┐
│  1. Product Identification  │
│  2. Condition Assessment    │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  3. Search Query Generation │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  4. Grounded Market Search  │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  5. Evidence Filtering      │
│     + Relevance             │
│     + Outlier Removal       │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  6. Deterministic Pricing   │
│     + Weighted Median       │
│     + Condition Adjustment  │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  7. Confidence Scoring      │
└──────────────┬──────────────┘
               │
               ▼
Schema Validation
      │
      ▼
PriceSnapResult
      │
      ▼
Client
```

---

## Valuation Pipeline

### Stage 1 — Product Identification

The submitted image is analysed to identify the physical product.

Typical structured output includes:

- Product name
- Brand
- Model
- Variant
- Category
- Visible specifications
- Identification confidence

Identification output passes through `validateIdentification` before it can continue through the valuation pipeline.

Unknown or uncertain attributes should not be invented.

---

### Stage 2 — Condition Assessment

The image is analysed for visible condition and defects.

Supported condition grades are represented by the strict `ConditionGrade` type.

Condition assessment can consider:

- Scratches
- Cracks
- Dents
- Screen damage
- Discolouration
- Missing components
- General wear
- Broken components
- Packaging
- Visible accessories

Condition is used later by the deterministic pricing engine.

---

### Stage 3 — Search Query Generation

`buildQueries` converts validated product identification into targeted market-search queries.

Queries should prioritize reliable product attributes such as:

```text
Samsung Galaxy S23 Ultra 256GB used NZ
Samsung S23 Ultra 256GB second hand
Samsung Galaxy S23 Ultra Trade Me
```

Uncertain product attributes should not be used to over-specify searches.

---

### Stage 4 — Grounded Market Search

`groundedSearch` gathers real-world market evidence relevant to the identified product.

PriceSnap is designed primarily for the **New Zealand secondhand market**, so NZ evidence should be preferred where available.

Market evidence may include information from:

- Public marketplace listings
- Used-product listings
- Refurbished-product listings
- Retail references
- Search-engine results
- Specialist secondhand retailers

Evidence must contain enough information to be evaluated before it can influence pricing.

URLs must never be fabricated.

---

### Stage 5 — Evidence Filtering

Market evidence is cleaned before pricing.

The pipeline uses:

```text
calculateRelevance()
        ↓
filterEvidence()
        ↓
removeOutliers()
```

Filtering is responsible for preventing weak or misleading comparables from influencing the final valuation.

Evidence may be rejected or reduced in influence when it represents:

- Wrong products
- Different generations
- Significant variant mismatches
- Accessories
- Replacement parts
- Broken products
- Bundles
- Duplicate listings
- Invalid prices
- Ambiguous currencies
- Weak search matches
- Extreme price outliers

Evidence classification is **not a separate pipeline stage**.

Evidence quality is handled through the existing relevance, filtering, validation, and outlier-removal logic.

---

### Stage 6 — Deterministic Pricing

The AI model does **not** determine the final resale price.

PriceSnap calculates it programmatically.

The pricing engine uses the surviving comparable evidence to calculate a base market value using:

```text
weightedMedian()
```

The result is then adjusted for the item's visible condition:

```text
applyConditionAdjustment()
```

Conceptually:

```text
Validated Comparables
        ↓
Weighted Median
        ↓
Base Market Value
        ↓
Condition Adjustment
        ↓
Estimated Resale Value
```

The API should return an estimated resale range as well as the expected value.

Example:

```json
{
  "low": 780,
  "expected": 860,
  "high": 940,
  "currency": "NZD"
}
```

---

### Stage 7 — Confidence Scoring

Confidence is calculated programmatically rather than generated directly by the AI.

`calculateConfidence` considers signals such as:

- Identification confidence
- Number of usable comparables
- Comparable relevance
- Price consistency
- Market evidence presence

The result is normalized into a numeric score and strict `ConfidenceLevel`.

Example:

```json
{
  "score": 87,
  "level": "HIGH"
}
```

A high confidence score should indicate that PriceSnap has strong identification and sufficiently consistent market evidence supporting the valuation.

---

## End-to-End Flow

```text
IMAGE
  ↓
IDENTIFICATION
  ↓
CONDITION
  ↓
SEARCH QUERIES
  ↓
MARKET EVIDENCE
  ↓
RELEVANCE
  ↓
FILTERING
  ↓
OUTLIER REMOVAL
  ↓
WEIGHTED MEDIAN
  ↓
CONDITION ADJUSTMENT
  ↓
CONFIDENCE
  ↓
SCHEMA VALIDATION
  ↓
PRICESNAP RESULT
```

---

## API

### Health Check

```http
GET /api/ping
```

Used by clients and deployment monitoring to confirm that the PriceSnap backend is available.

Example response:

```json
{
  "status": "ok",
  "service": "pricesnap-backend"
}
```

---

### Create Valuation

```http
POST /api/valuate
```

Example request:

```json
{
  "imageBase64": "..."
}
```

The endpoint validates the request and delegates valuation work to the shared valuation engine.

API routes should remain thin. Pricing and evidence logic belongs inside the valuation engine rather than inside route handlers.

---

## Example Result

```json
{
  "success": true,
  "item": {
    "name": "Samsung Galaxy S23 Ultra",
    "brand": "Samsung",
    "model": "Galaxy S23 Ultra",
    "variant": "256GB",
    "category": "Smartphone"
  },
  "condition": {
    "grade": "GOOD",
    "score": 76,
    "defects": [
      "Minor visible frame wear"
    ]
  },
  "valuation": {
    "low": 780,
    "expected": 860,
    "high": 940,
    "currency": "NZD"
  },
  "confidence": {
    "score": 87,
    "level": "HIGH"
  },
  "comparables": [],
  "marketplaceRecommendation": "Trade Me",
  "summary": "..."
}
```

---

## Error Handling

PriceSnap uses structured errors rather than returning incomplete or invented valuations.

Example:

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_EVIDENCE",
    "message": "Unable to generate a reliable valuation."
  }
}
```

Expected error categories include:

```text
INVALID_REQUEST
NO_IMAGE
IMAGE_TOO_LARGE
UNSUPPORTED_IMAGE
IDENTIFICATION_FAILED
INSUFFICIENT_EVIDENCE
AI_PROVIDER_ERROR
SEARCH_FAILED
VALIDATION_FAILED
VALUATION_FAILED
RATE_LIMITED
INTERNAL_ERROR
```

Internal stack traces, credentials, raw provider errors, and sensitive payloads must not be returned to clients.

---

## Validation

AI responses and external market evidence must be considered untrusted input.

PriceSnap validates:

- Required fields
- Primitive types
- Condition grades
- Confidence levels
- Price boundaries
- Currency
- Comparable structure
- URLs
- Nullable/unknown fields
- Final API schema

Malformed AI output should either be safely normalized or rejected.

It must never silently become a valid PriceSnap valuation.

---

## Environment

Create a local environment file:

```text
.env.local
```

Configure the required server-side credentials.

Example:

```ini
OPENAI_API_KEY=your_api_key_here
```

Secrets must remain server-side.

Never expose provider API keys through:

- Android source code
- Client-side JavaScript
- API responses
- Public repositories
- Application logs

---

## Installation

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Run TypeScript validation:

```bash
npm run typecheck
```

Create a production build:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

---

## Technology

```text
Runtime        Node.js
Framework      Next.js
Language       TypeScript
Deployment     Vercel
Currency       NZD
Primary Market New Zealand
```

The project uses strict TypeScript configuration so valuation contracts and pipeline boundaries remain strongly typed.

---

## Security

The backend should:

- Validate all incoming requests
- Enforce image size limits
- Restrict supported image formats
- Keep provider credentials server-side
- Avoid logging Base64 image payloads
- Avoid logging secrets
- Apply request/rate limits
- Validate external evidence
- Validate all AI-generated structures
- Return controlled error responses

Images should be retained only for as long as required to perform the valuation unless an explicit product requirement requires longer storage.

---

## Valuation Integrity

PriceSnap should prefer returning **insufficient evidence** over manufacturing certainty.

The following rules are fundamental:

```text
Never fabricate comparable listings.
Never fabricate URLs.
Never treat AI output as verified market evidence.
Never allow malformed evidence into pricing.
Never allow the AI model to directly set final confidence.
Never allow the AI model to directly control final valuation.
```

---

## Development Principles

When extending PriceSnap:

1. Keep API routes thin.
2. Keep valuation logic inside the shared engine.
3. Keep identification separate from pricing.
4. Keep evidence filtering deterministic where practical.
5. Keep pricing deterministic.
6. Keep confidence programmatic.
7. Validate every external boundary.
8. Prefer explicit failure over invented evidence.
9. Measure valuation changes against the benchmark suite.
10. Avoid changing frozen architecture unless benchmark evidence justifies it.

---

## Deployment

PriceSnap is designed for deployment on Vercel.

```text
Client
   │
   │ HTTPS
   ▼
Vercel
   │
   ▼
PriceSnap API
   │
   ▼
Valuation Engine
   ├── Identification
   ├── Condition
   ├── Market Search
   ├── Evidence Filtering
   ├── Pricing
   └── Confidence
   │
   ▼
Validated PriceSnapResult
```

Production secrets should be configured through the deployment environment rather than committed to source control.

---

## Current Development Status

The core valuation architecture is considered **frozen**.

Implemented architectural components include:

```text
✓ Structured product identification
✓ Identification validation
✓ Condition assessment
✓ Search query generation
✓ Grounded market search
✓ Evidence relevance scoring
✓ Evidence filtering
✓ Outlier removal
✓ Weighted-median pricing
✓ Condition adjustment
✓ Programmatic confidence scoring
✓ Strict result validation
✓ Structured error handling
```

New work should focus on measurable improvements, testing, diagnostics, evidence quality, reliability, and product features without unnecessarily redesigning the core valuation pipeline.

---

## Benchmarking

Changes to valuation behavior should be measured against the established PriceSnap benchmark set.

Useful metrics include:

```text
Identification accuracy
Absolute valuation error
Percentage valuation error
Comparable acceptance rate
Comparable rejection rate
Price dispersion
Confidence calibration
Pipeline latency
Failure rate
```

A pricing or filtering change should be evaluated against the baseline before becoming the new default.

---

## License

Private project.

Copyright © PriceSnap. All rights reserved.
