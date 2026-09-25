import { clamp } from "../ai/parse-json";
import type {
  Confidence,
  IdentifiedItem,
  MarketEvidence,
  Valuation,
} from "../types";

/**
 * Explainable confidence from evidence quality — not LLM "vibes".
 *
 * Weights:
 *   Identification confidence  30%
 *   Comparable count           25%
 *   Price consistency          20%
 *   Variant matching           15%
 *   Evidence freshness         10%
 */
export function calculateConfidence(
  identification: IdentifiedItem,
  evidence: MarketEvidence,
  valuation: Valuation,
): Confidence {
  const idScore = clamp(identification.identificationConfidence, 0, 1);
  const countScore = comparableCountScore(evidence.comparables.length);
  const consistencyScore = priceConsistencyScore(
    evidence.comparables.map((c) => c.price),
    valuation.estimatedValue,
  );
  const variantScore = average(evidence.comparables.map((c) => c.variantMatch));
  const freshnessScore = average(evidence.comparables.map((c) => c.freshness));

  const score = clamp(
    idScore * 0.3 +
      countScore * 0.25 +
      consistencyScore * 0.2 +
      variantScore * 0.15 +
      freshnessScore * 0.1,
    0,
    1,
  );

  const level: Confidence["level"] =
    score >= 0.75 ? "high" : score >= 0.45 ? "medium" : "low";

  return {
    score: Math.round(score * 100) / 100,
    level,
  };
}

function comparableCountScore(count: number): number {
  if (count >= 6) return 1;
  if (count >= 4) return 0.85;
  if (count >= 3) return 0.7;
  if (count >= 2) return 0.45;
  if (count >= 1) return 0.25;
  return 0;
}

function priceConsistencyScore(prices: number[], estimated: number): number {
  if (prices.length < 2 || estimated <= 0) return prices.length === 1 ? 0.4 : 0;

  const mean =
    prices.reduce((sum, p) => sum + p, 0) / Math.max(prices.length, 1);
  const variance =
    prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length;
  const stdev = Math.sqrt(variance);
  const cv = stdev / estimated;

  if (cv <= 0.15) return 1;
  if (cv <= 0.3) return 0.8;
  if (cv <= 0.5) return 0.55;
  if (cv <= 0.8) return 0.35;
  return 0.15;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
