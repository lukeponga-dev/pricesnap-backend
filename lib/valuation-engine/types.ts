export interface ImageRequest {
  imageBase64: string;
}

export interface AppraisalResponse {
  item: {
    name: string;
    brand?: string;
    model?: string;
    category: string;
    attributes?: Record<string, string>;
  };

  condition: {
    grade: string;
    score: number;
    notes: string[];
  };

  valuation: {
    currency: "NZD";
    estimatedValue: number;
    low: number;
    high: number;
  };

  confidence: {
    score: number;
    level: "low" | "medium" | "high";
  };

  comparables: Comparable[];

  generatedAt: string;
}

export interface Comparable {
  title: string;
  price: number;
  currency: string;
  source: string;
  url?: string;
}

/** Internal identification result from the vision model. */
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
  identificationConfidence: number;
}

/** A raw candidate listing before validation/filtering. */
export interface CandidateListing {
  title: string;
  price: number;
  currency: string;
  source: string;
  url?: string;
  /** Optional ISO date when the listing was observed/listed. */
  listedAt?: string;
  /** Model-reported relevance before deterministic filters. */
  relevanceNotes?: string;
}

/** Normalized market evidence used by pricing + confidence. */
export interface MarketEvidence {
  searchQueries: string[];
  comparables: ScoredComparable[];
}

export interface ScoredComparable extends Comparable {
  /** 0–1 how well title/attrs match the identified variant. */
  variantMatch: number;
  /** 0–1 freshness of the evidence (1 = recent). */
  freshness: number;
}

export type Valuation = AppraisalResponse["valuation"];
export type Confidence = AppraisalResponse["confidence"];
