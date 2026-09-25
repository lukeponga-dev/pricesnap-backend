/**
 * PriceSnap valuation engine — public entry point.
 *
 * Pipeline (do not collapse into one “what’s this worth?” LLM call):
 *
 *   image → identifyItem → findMarketEvidence → calculateValuation
 *         → calculateConfidence → AppraisalResponse
 *
 * AI is used for identification and evidence interpretation only.
 * Price and confidence are calculated deterministically by this engine.
 */
import { calculateConfidence } from "./confidence";
import { findMarketEvidence } from "./evidence";
import { identifyItem } from "./identification";
import { calculateValuation } from "./pricing";
import type { AppraisalResponse } from "./types";

/**
 * Run a full appraisal for a single product photo (base64).
 */
export async function valuateImage(
  imageBase64: string,
): Promise<AppraisalResponse> {
  // 1. What is it? (vision model — no price)
  const identification = await identifyItem(imageBase64);

  // 2. What does the market show? (queries → candidates → filters)
  const evidence = await findMarketEvidence(identification);

  // 3. What is a fair NZD band? (median of surviving comparables)
  const valuation = calculateValuation(evidence.comparables);

  // 4. How trustworthy is that estimate? (evidence quality weights)
  const confidence = calculateConfidence(
    identification,
    evidence,
    valuation,
  );

  // Strip internal scoring fields (variantMatch / freshness) from the API payload.
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
      ...(Object.keys(identification.item.attributes).length > 0
        ? { attributes: identification.item.attributes }
        : {}),
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
