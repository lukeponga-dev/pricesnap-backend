import type { AppraisalResponse } from "../valuation-engine/types";
import type { SaleStrategy } from "./types";

const roundToFive = (value: number) => Math.max(5, Math.round(value / 5) * 5);

/** Derive seller targets from evidence-derived valuation fields only. */
export function calculateSaleStrategy(valuation: AppraisalResponse): SaleStrategy {
  const market = valuation.valuation;
  if (
    valuation.status !== "success" ||
    market.estimatedValue === null ||
    market.low === null ||
    market.high === null
  ) {
    return {
      currency: "NZD",
      suggestedListingPrice: null,
      targetSalePrice: null,
      minimumNegotiationPrice: null,
      basis: "insufficient_evidence",
    };
  }

  const targetSalePrice = roundToFive(market.estimatedValue);
  const suggestedListingPrice = roundToFive(
    Math.max(targetSalePrice, Math.min(market.high, market.estimatedValue * 1.1)),
  );
  const minimumNegotiationPrice = roundToFive(
    Math.min(targetSalePrice, Math.max(market.low, market.estimatedValue * 0.9)),
  );

  return {
    currency: "NZD",
    suggestedListingPrice,
    targetSalePrice,
    minimumNegotiationPrice,
    basis: "evidence_derived",
  };
}
