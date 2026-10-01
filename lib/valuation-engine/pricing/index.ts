/**
 * Pricing step — pure functions over validated comparables.
 */
import type { ScoredComparable, Valuation } from "../types";

function normalizeToNZD(price: number, currency: string, rate: number): number {
  return currency === "USD" ? price * rate : price;
}

export async function calculateValuation(
  comparables: ScoredComparable[],
  rate: number,
): Promise<Valuation> {
  const validComps = comparables
    .map((c) => ({
      price: normalizeToNZD(c.price, c.currency, rate),
      weight: (c.variantMatch * 0.7) + (c.freshness * 0.3),
    }))
    .filter((c) => Number.isFinite(c.price) && c.price > 0);

  if (validComps.length === 0) {
    throw new Error("Insufficient market evidence");
  }

  const totalWeight = validComps.reduce((sum, c) => sum + c.weight, 0);
  
  const weightedMedian = totalWeight > 0
    ? validComps.reduce((sum, c) => sum + (c.price * c.weight), 0) / totalWeight
    : validComps.reduce((sum, c) => sum + c.price, 0) / validComps.length;

  return {
    currency: "NZD",
    estimatedValue: Math.round(weightedMedian),
    low: Math.round(weightedMedian * 0.85),
    high: Math.round(weightedMedian * 1.15),
  };
}

