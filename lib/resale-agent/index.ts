import type { AppraisalResponse } from "../valuation-engine/types";
import { buildListingChecklist, buildNegotiationGuidance } from "./guidance";
import { createListingProvider, DeterministicListingProvider } from "./providers";
import { calculateSaleStrategy } from "./strategy";
import type { ListingProvider, ResalePreferences, ResaleResponse } from "./types";

export async function createResalePlan(
  valuation: AppraisalResponse,
  preferences: ResalePreferences = {},
  options: { signal?: AbortSignal; listingProvider?: ListingProvider } = {},
): Promise<ResaleResponse> {
  const saleStrategy = calculateSaleStrategy(valuation);
  const context = { valuation, strategy: saleStrategy, preferences };
  const provider = options.listingProvider || createListingProvider();
  let listing;
  try {
    listing = await provider.generate(context, options.signal);
  } catch {
    // Listing copy is optional. A provider outage must not alter valuation or strategy.
    listing = await new DeterministicListingProvider().generate(context);
  }
  return {
    ok: true,
    status: valuation.status,
    valuation,
    saleStrategy,
    listing,
    negotiationGuidance: buildNegotiationGuidance(valuation, saleStrategy),
    listingChecklist: buildListingChecklist(valuation),
  };
}

export type * from "./types";
export { calculateSaleStrategy } from "./strategy";
export { DeterministicListingProvider, OpenAIListingProvider } from "./providers";
