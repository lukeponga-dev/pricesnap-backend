import { verifyFirebaseRequest } from "./auth";
import { enforceValuationLimit } from "./rate-limit";

/**
 * Shared gate for every endpoint capable of triggering paid provider work.
 * Keep this ahead of request parsing and provider invocation.
 */
export async function enforceProviderAccess(request: Request): Promise<void> {
  const caller = await verifyFirebaseRequest(request);
  enforceValuationLimit(caller);
}
