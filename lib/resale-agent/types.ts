import type { AppraisalResponse } from "../valuation-engine/types";

export interface ResalePreferences {
  marketplace?: string;
  notes?: string;
}

export interface SaleStrategy {
  currency: "NZD";
  suggestedListingPrice: number | null;
  targetSalePrice: number | null;
  minimumNegotiationPrice: number | null;
  basis: "evidence_derived" | "insufficient_evidence";
}

export interface ListingDraft {
  title: string;
  description: string;
  provider: "openai" | "deterministic";
}

export interface ResaleResponse {
  ok: true;
  status: AppraisalResponse["status"];
  valuation: AppraisalResponse;
  saleStrategy: SaleStrategy;
  listing: ListingDraft;
  negotiationGuidance: string[];
  listingChecklist: string[];
}

export interface ListingContext {
  valuation: AppraisalResponse;
  strategy: SaleStrategy;
  preferences: ResalePreferences;
}

export interface ListingProvider {
  generate(context: ListingContext, signal?: AbortSignal): Promise<ListingDraft>;
}
