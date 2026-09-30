import type { AppraisalResponse } from "../valuation-engine/types";
import type { SaleStrategy } from "./types";

export function buildNegotiationGuidance(
  valuation: AppraisalResponse,
  strategy: SaleStrategy,
): string[] {
  if (strategy.basis === "insufficient_evidence") {
    return [
      "Collect at least two grounded NZD comparables before setting a negotiation floor.",
      "Describe condition accurately and invite buyers to inspect or test the item.",
    ];
  }
  return [
    `List at NZD ${strategy.suggestedListingPrice} to leave measured room for negotiation.`,
    `Aim to close near NZD ${strategy.targetSalePrice}.`,
    `Do not accept less than NZD ${strategy.minimumNegotiationPrice} without reviewing fresh evidence or changing your sale goal.`,
    ...valuation.condition.notes.slice(0, 2).map((note) => `Disclose visible condition: ${note}`),
  ];
}

export function buildListingChecklist(valuation: AppraisalResponse): string[] {
  return [
    "Photograph the item from the front, back, sides, and any damaged areas in good light.",
    "Confirm included accessories and remove personal data or linked accounts.",
    "Test core functions and state clearly what was and was not tested.",
    `Use the identified item and condition only after checking them: ${valuation.item.name}, ${valuation.condition.grade}.`,
    "Choose a safe payment and handover method and keep marketplace messages on-platform.",
  ];
}
