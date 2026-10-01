# PriceSnap Backend API Guide

## Overview
PriceSnap Backend provides AI-powered item identification and market valuation services. All valuation results are normalized to **NZD**.

## Base URL
`/api`

---

## Endpoints

### 1. Item Valuation
`POST /api/valuate`

Analyzes an image to identify an item and estimate its current second-hand market value.

**Request Body**
Based on `ValuateRequest` (see `lib/validation/valuate-request.ts`). Typically includes:
- `imageBase64`: Base64 encoded image.
- `mimeType`: Image MIME type (e.g., `image/jpeg`).

**Response Body (`AppraisalResponse`)**
```json
{
  "ok": true,
  "status": "success" | "insufficient_evidence" | "heuristic",
  "item": {
    "name": "string",
    "brand": "string",
    "model": "string",
    "category": "string",
    "attributes": { "key": "value" }
  },
  "condition": {
    "grade": "string",
    "score": number,
    "notes": ["string"]
  },
  "valuation": {
    "currency": "NZD",
    "estimatedValue": number | null,
    "low": number | null,
    "high": number | null
  },
  "confidence": {
    "score": number, 
    "level": "low" | "medium" | "high"
  },
  "comparables": [
    {
      "title": "string",
      "price": number,
      "currency": "string",
      "source": "string",
      "url": "string"
    }
  ],
  "generatedAt": "ISO-8601 string",
  "warnings": ["string"]
}
```

**Status Definitions:**
- `success`: Valuation based on multiple grounded market comparables.
- `heuristic`: Valuation based on AI general market knowledge (low confidence).
- `insufficient_evidence`: No sufficient data found to provide a valuation.

---

### 2. Resale Strategy
`POST /api/resale`

Provides a strategic pricing recommendation for selling an item based on its valuation.

---

### 3. Connection Status
`GET /api/connection`

Checks the health of the backend and its connectivity to required AI providers.

**Response:**
- `200 OK`: All systems operational.
- `503 Service Unavailable`: Provider connectivity issues.

---

### 4. Health Check (Ping)
`GET /api/ping`

Simple heartbeat endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "pricesnap-backend",
  "timestamp": number
}
```

## Error Handling
The API uses standard HTTP status codes and returns a structured error response for `ApiError` types:
- `IDENTIFICATION_UNCERTAIN`: Image could not be identified with high confidence.
- `PROVIDER_RATE_LIMIT`: AI provider limit reached.
- `VALUATION_FAILED`: An unexpected error occurred during processing.
