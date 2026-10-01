import { GoogleGenAI } from "@google/genai";
import { ApiError } from "../../api/errors";

export const ENGINE_VERSION = "internal-1.0.0";

export function getModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
}

/** Market-evidence model. Search grounding on current Gemini 3.x models requires paid API access. */
export function getEvidenceModel(): string {
  return process.env.GEMINI_EVIDENCE_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
}

/** Free-tier multimodal model used for photo identification only. */
export function getVisionModel(): string {
  return process.env.GEMINI_VISION_MODEL?.trim() || "gemini-3.1-flash";
}

export function hasApiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new ApiError("SERVICE_NOT_CONFIGURED");
  return new GoogleGenAI({ apiKey });
}

function providerStatus(error: unknown): number | undefined {
  const queue: unknown[] = [error];
  const seen = new Set<object>();
  for (let depth = 0; queue.length && depth < 8; depth += 1) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    const value = current as Record<string, unknown>;
    if (typeof value.status === "number") return value.status;
    if (typeof value.statusCode === "number") return value.statusCode;
    if (typeof value.code === "number") return value.code;
    const code = typeof value.code === "string" ? value.code
      : typeof value.status === "string" ? value.status : undefined;
    if (code === "RESOURCE_EXHAUSTED") return 429;
    if (code === "UNAVAILABLE") return 503;
    for (const key of ["error", "cause", "response"]) {
      if (value[key]) queue.push(value[key]);
    }
  }
  return undefined;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

/** Retry only transient provider failures; permanent request/auth/model errors fail immediately. */
export async function withGeminiRetry<T>(
  operation: () => Promise<T>,
  model: string,
  signal?: AbortSignal,
  maxAttempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    signal?.throwIfAborted();
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const status = providerStatus(error);
      const retryable = status === 429 || status === 500 || status === 502 ||
        status === 503 || status === 504;
      if (!retryable || attempt === maxAttempts) throw error;

      // Bounded exponential backoff with small jitter; log metadata only.
      const backoffMs = 750 * (2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
      console.warn(JSON.stringify({
        event: "gemini_retry",
        model,
        providerStatus: status,
        attempt,
        nextAttempt: attempt + 1,
        backoffMs,
      }));
      await delay(backoffMs, signal);
    }
  }
  throw lastError;
}
