/**
 * Shared contracts for the valuation engine and `/api/valuate` responses.
 *
 * `AppraisalResponse` is the public Android-facing shape.
 * `IdentifiedItem` / `MarketEvidence` / `ScoredComparable` are internal
 * pipeline types and may carry extra fields used only by pricing/confidence.
 */

/** Incoming photo payload from the client. */
export type { ValuateRequest as ImageRequest } from "../validation/valuate-request";

/** Public appraisal result returned by `valuateImage` / POST /api/valuate. */
export interface AppraisalResponse {
  ok: true;
  status: "success" | "insufficient_evidence" | "heuristic";
  warnings: string[];
  item: {
    name: string;
    brand?: string;
    model?: string;
    category: string;
  };

  condition: {
    grade: string;
    /** 0-100 visual condition score from identification. */
    score: number;
    notes: string[];
  };

  valuation: {
    currency: "NZD" | "USD";
    estimatedValue: number | null;
    low: number | null;
    high: number | null;
  };

  confidence: {
    /** 0-1 explainable score from evidence quality, not LLM self-rating alone. */
    score: number;
    level: "low" | "medium" | "high";
  };

  comparables: Comparable[];

  generatedAt: string;
}

/** A single market listing used as pricing evidence. */
export interface Comparable {
  title: string;
  price: number;
  currency: string;
  source: string;
  url?: string;
}

/**
 * Output of the identification step.
 * Separates what we think it is from pricing so the model never owns the sale price.
 */
export interface IdentifiedItem {
  item: {
    name: string;
    brand?: string;
    model?: string;
    category: string;
    attributes: Record<string, string>;
  };
  condition: {
    grade: string;
    score: number;
    notes: string[];
  };
  /** Model certainty about identity only (feeds confidence, not price). */
  identificationConfidence: number;
}

/** Raw listing before deterministic validation/filtering. */
export interface CandidateListing {
  title: string;
  price: number;
  currency: string;
  source: string;
  url?: string;
  /** Optional ISO date when the listing was observed/listed. */
  listedAt?: string;
  /** Free-text relevance note from retrieval (not trusted for scoring). */
  relevanceNotes?: string;
}

/** Validated evidence bag passed to pricing and confidence. */
export interface MarketEvidence {
  /** Queries derived from identification (useful for debugging / future live search). */
  searchQueries: string[];
  comparables: ScoredComparable[];
}

/**
 * Comparable plus internal quality signals used by `calculateConfidence`.
 * These fields are stripped before the public API response.
 */
export interface ScoredComparable extends Comparable {
  /** 0-1 how well title/attrs match the identified variant. */
  variantMatch: number;
  /** 0-1 freshness of the evidence (1 = recent). */
  freshness: number;
}

export type Valuation = AppraisalResponse["valuation"];
export type Confidence = AppraisalResponse["confidence"];
