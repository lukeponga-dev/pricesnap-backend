/** Business billing policy; pure functions keep payment concerns outside valuation engine. */
export const BUSINESS_STARTER = {
  plan: "business_starter",
  currency: "nzd",
  monthlyPriceCents: 4900,
  // Provisional limit; change before launch based on provider costs.
  monthlyValuationLimit: 100,
} as const;

export type SubscriptionStatus =
  | "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "incomplete" | "incomplete_expired" | "paused";

export interface BusinessEntitlement {
  firebaseUid: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: SubscriptionStatus | null;
  currentPeriodEnd: string | null;
  usageThisPeriod: number;
}

export function canValuate(entitlement: BusinessEntitlement, now = new Date()): boolean {
  if (entitlement.status !== "active" && entitlement.status !== "trialing") return false;
  if (!entitlement.currentPeriodEnd || !Number.isFinite(Date.parse(entitlement.currentPeriodEnd))) return false;
  if (new Date(entitlement.currentPeriodEnd).getTime() <= now.getTime()) return false;
  return Number.isSafeInteger(entitlement.usageThisPeriod)
    && entitlement.usageThisPeriod >= 0
    && entitlement.usageThisPeriod < BUSINESS_STARTER.monthlyValuationLimit;
}

/** Only grounded or explicitly accepted heuristic valuations consume allowance. */
export function isBillableValuation(result: { ok: boolean; status: string }): boolean {
  return result.ok && (result.status === "success" || result.status === "heuristic");
}
