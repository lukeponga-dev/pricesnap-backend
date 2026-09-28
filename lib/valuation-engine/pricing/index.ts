/**
 * Pricing step — pure functions over validated comparables.
 *
 * The AI never answers “what is this worth?”. We take surviving market prices,
 * compute a median, and publish a simple NZD band (±15% for now).
 */
import type { ScoredComparable, Valuation } from "../types";

/**
 * Derive estimated / low / high NZD values from comparable prices.
 * @throws if there are no usable positive prices
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

  // Classic median: average the two middle values when the count is even.
  const middle = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 0
      ? (prices[middle - 1] + prices[middle]) / 2
      : prices[middle];

  return {
    currency: "NZD",
    estimatedValue: Math.round(median),
    // Temporary band — replace with tighter statistics as evidence improves.
    low: Math.round(median * 0.85),
    high: Math.round(median * 1.15),
  };
}

