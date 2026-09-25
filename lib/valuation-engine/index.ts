import { calculateConfidence } from "./confidence";
import { findMarketEvidence } from "./evidence";
import { identifyItem } from "./identification";
import { calculateValuation } from "./pricing";
import type { AppraisalResponse } from "./types";

/**
 * Full appraisal pipeline:
 * Identification → Evidence → Pricing → Confidence → AppraisalResponse
 *
 * The model identifies and interprets. The engine calculates price + confidence.
 */
export async function valuateImage(
  imageBase64: string,
): Promise<AppraisalResponse> {
  const identification = await identifyItem(imageBase64);
  const evidence = await findMarketEvidence(identification);
  const valuation = calculateValuation(evidence.comparables);
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
