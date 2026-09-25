/**
 * PriceSnap valuation engine - public entry point.
 *
 * Pipeline:
 *   image -> identifyItem -> findMarketEvidence -> calculateValuation
 *         -> calculateConfidence -> AppraisalResponse
 *
 * Gemini identifies and interprets the item. Real evidence establishes the
 * market. Deterministic code calculates the valuation and confidence.
 */
import { calculateConfidence } from "./confidence";
import { findMarketEvidence } from "./evidence";
import { identifyItem } from "./identification";
import { calculateAiEstimate, calculateValuation } from "./pricing";
import { withTimeout } from "./timeout";
import type { AppraisalResponse } from "./types";

/**
 * Run a full appraisal for a single product photo.
 */
export async function valuateImage(
  imageBase64: string,
  mimeType: string,
): Promise<AppraisalResponse> {
  const identification = await withTimeout(
    "Identification",
    12_000,
    identifyItem(imageBase64, mimeType),
  );

  const evidence = await withTimeout(
    "Market retrieval",
    8_000,
    findMarketEvidence(identification),
  );

  const valuation =
    evidence.comparables.length > 0
      ? calculateValuation(evidence.comparables)
      : calculateAiEstimate(identification.condition.score);

  const confidence = calculateConfidence(
    identification,
    evidence,
    valuation,
  );

  return {
    item: {
      name: identification.item.name,
      ...(identification.item.brand
        ? { brand: identification.item.brand }
        : {}),
      ...(identification.item.model
        ? { model: identification.item.model }
        : {}),
      category: identification.item.category,
    },
    condition: identification.condition,
    valuation,
    confidence,
    comparables: evidence.comparables.map((c) => ({
      title: c.title,
      price: c.price,
      currency: c.currency,
      source: c.source,
      ...(c.url ? { url: c.url } : {}),
    })),
    generatedAt: new Date().toISOString(),
  };
}
