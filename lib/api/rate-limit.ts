import { ApiError } from "./errors";
import type { VerifiedCaller } from "./auth";

interface Bucket { windowStart: number; count: number }
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 24 * 60 * 60 * 1000;

function configuredLimit(caller: VerifiedCaller): number {
  const key = caller.anonymous ? "VALUATION_DAILY_GUEST_LIMIT" : "VALUATION_DAILY_USER_LIMIT";
  const fallback = caller.anonymous ? 10 : 50;
  const parsed = Number(process.env[key] ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Application-level per-UID spending guard. It runs before provider calls.
 * This is a process-local per-UID guard. It prevents unchecked spend within
 * an instance but is not a globally durable quota across serverless instances.
 */
export function enforceValuationLimit(caller: VerifiedCaller, now = Date.now()): void {
  const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const current = buckets.get(caller.uid);
  const bucket = !current || current.windowStart !== windowStart ? { windowStart, count: 0 } : current;
  if (bucket.count >= configuredLimit(caller)) throw new ApiError("RATE_LIMITED");
  bucket.count += 1;
  buckets.set(caller.uid, bucket);

  if (buckets.size > 10_000) {
    for (const [uid, value] of buckets) if (value.windowStart !== windowStart) buckets.delete(uid);
  }
}
