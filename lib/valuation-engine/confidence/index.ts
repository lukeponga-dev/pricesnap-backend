/**
 * Confidence step — explainable score from evidence quality.
 *
 * Intentionally not “how sure the LLM feels”. Weights reflect how much we
 * trust identity, sample size, price agreement, variant fit, and freshness.
 *
 *   Identification confidence  30%
 *   Comparable count           25%
 *   Price consistency          20%
 *   Variant matching           15%
 *   Evidence freshness         10%
 */
import { clamp } from "../ai/parse-json";
import type {
  Confidence,
  IdentifiedItem,
  MarketEvidence,
  Valuation,
} from "../types";

/**
 * Combine identification + evidence signals into a 0–1 score and level label.
 */
export function calculateConfidence(
  identification: IdentifiedItem,
  evidence: MarketEvidence,
  valuation: Valuation,
  isHeuristic = false,
  aiConfidence = 0,
): Confidence {
  if (valuation.estimatedValue === null) {
    return { score: 0, level: "low" };
  }

  if (isHeuristic) {
    // A heuristic valuation has no grounded market-evidence component, but it
    // should not be reported as 0% when identification and estimation both
    // succeeded. Keep it capped below "high" and weight identity alongside
    // the estimator's self-confidence.
    if (evidence.comparables.length === 0) {
    return { score: 0, level: "low" };
  }

  const idScore = clamp(identification.identificationConfidence, 0, 1);
    const score = clamp(idScore * 0.2 + clamp(aiConfidence, 0, 1) * 0.3, 0, 0.49);
    return {
      score: Math.round(score * 100) / 100,
      level: score >= 0.45 ? "medium" : "low",
    };
  }

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

/** More surviving comps → higher trust (diminishing returns after ~6). */
function comparableCountScore(count: number): number {
  if (count >= 6) return 1;
  if (count >= 4) return 0.85;
  if (count >= 3) return 0.7;
  if (count >= 2) return 0.45;
  if (count >= 1) return 0.25;
  return 0;
}

/**
 * Coefficient of variation (stdev / estimate): tight clusters score higher.
 * A single comparable gets a modest fixed score — not enough to claim “high”.
 */
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
