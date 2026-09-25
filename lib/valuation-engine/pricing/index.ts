import type { ScoredComparable, Valuation } from "../types";

/**
 * Deterministic pricing from comparables.
 * The AI identifies and interprets; this engine calculates.
 */
export function calculateValuation(
  comparables: ScoredComparable[],
): Valuation {
  const prices = comparables
    .map((c) => c.price)
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);

  if (prices.length === 0) {
    throw new Error("Insufficient market evidence");
  }

  const middle = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 0
      ? (prices[middle - 1] + prices[middle]) / 2
      : prices[middle];

  return {
    currency: "NZD",
    estimatedValue: Math.round(median),
    low: Math.round(median * 0.85),
    high: Math.round(median * 1.15),
  };
}
