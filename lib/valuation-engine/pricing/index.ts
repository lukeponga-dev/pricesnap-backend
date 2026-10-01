import type { ScoredComparable, Valuation } from "../types";

function normalizeToNZD(price: number, currency: string, rate: number): number {
  return currency === "USD" ? price * rate : price;
}

export async function calculateValuation(
  comparables: ScoredComparable[],
  rate: number,
): Promise<Valuation> {
  const prices = comparables
    .map((c) => ({
      price: normalizeToNZD(c.price, c.currency, rate),
      weight: c.variantMatch * 0.7 + c.freshness * 0.3,
    }))
    .filter((c) => Number.isFinite(c.price) && c.price > 0);

  if (prices.length === 0) {
    throw new Error("Insufficient market evidence");
  }

  const totalWeight = prices.reduce((sum, c) => sum + c.weight, 0);
  const estimate = totalWeight > 0
    ? prices.reduce((sum, c) => sum + c.price * c.weight, 0) / totalWeight
    : prices.reduce((sum, c) => sum + c.price, 0) / prices.length;

  return {
    currency: "NZD",
    estimatedValue: Math.round(estimate),
    low: Math.round(estimate * 0.85),
    high: Math.round(estimate * 1.15),
  };
}

