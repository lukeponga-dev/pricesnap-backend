/**
 * Android compatibility adapter for the SAME service used by the web app.
 * Recognition, search, evidence filtering and pricing live in pricesnapai.
 */
import { ApiError, type ApiErrorCode } from "../api/errors";
import type { AppraisalResponse, Comparable } from "./types";

export const DEFAULT_ENGINE_URL = "https://pricesnapai.vercel.app/api/analyze";
const TIMEOUT_MS = 95_000; // Shared engine deadline is 90 seconds.

export interface EngineOptions {
  signal?: AbortSignal;
  requestUrl?: string;
}

function engineUrl(requestUrl?: string): URL {
  try {
    const url = new URL(process.env.PRICESNAP_ENGINE_URL || DEFAULT_ENGINE_URL);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
        (requestUrl && url.origin === new URL(requestUrl).origin)) {
      throw new Error("Invalid engine URL");
    }
    return url;
  } catch {
    throw new ApiError("SERVICE_NOT_CONFIGURED");
  }
}

export async function valuateImage(
  imageBase64: string,
  mimeType: string,
  options: EngineOptions = {},
  fetcher: typeof fetch = fetch,
): Promise<AppraisalResponse> {
  const url = engineUrl(options.requestUrl);
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, TIMEOUT_MS);
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();

  try {
    controller.signal.throwIfAborted();
    const response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ image: `data:${mimeType};base64,${imageBase64}` }),
      signal: controller.signal,
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) {
      // Map only the canonical engine's known public errors, never raw messages.
      const body: unknown = await response.json().catch(() => null);
      const code = isRecord(body) ? body.error : undefined;
      const allowed: Partial<Record<number, ApiErrorCode[]>> = {
        400: ["INVALID_IMAGE"],
        413: ["IMAGE_TOO_LARGE"],
        422: ["IDENTIFICATION_UNCERTAIN"],
        429: ["PROVIDER_RATE_LIMIT"],
        503: ["SERVICE_NOT_CONFIGURED"],
        504: ["ANALYSIS_TIMEOUT"],
      };
      throw new ApiError(
        typeof code === "string" && allowed[response.status]?.includes(code as ApiErrorCode)
          ? code as ApiErrorCode : "VALUATION_FAILED",
      );
    }
    return adaptResult(await response.json());
  } catch (error) {
    if (controller.signal.aborted) throw new ApiError("ANALYSIS_TIMEOUT");
    if (error instanceof ApiError) throw error;
    throw new ApiError("VALUATION_FAILED");
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new ApiError("VALUATION_FAILED");
  return value;
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new ApiError("VALUATION_FAILED");
  return value;
}

function number(value: unknown, min: number, max = Infinity): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new ApiError("VALUATION_FAILED");
  }
  return value;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(v => typeof v === "string")) {
    throw new ApiError("VALUATION_FAILED");
  }
  return value;
}

function listingUrl(value: unknown): string {
  const raw = text(value);
  const url = new URL(raw);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new ApiError("VALUATION_FAILED");
  }
  return raw;
}

function adaptResult(payload: unknown): AppraisalResponse {
  const result = record(payload);
  if (result.ok !== true || result.isMock === true ||
      !["success", "insufficient_evidence"].includes(String(result.status))) {
    throw new ApiError("VALUATION_FAILED");
  }
  const product = record(result.product);
  const condition = record(product.condition);
  const valuation = record(result.valuation);
  const evidence = record(result.evidence);
  const confidence = record(result.confidence);
  const insufficient = result.status === "insufficient_evidence";
  if (valuation.currency !== "NZD" || !Array.isArray(evidence.sources)) {
    throw new ApiError("VALUATION_FAILED");
  }

  // Insufficient evidence never retains a stale upstream price or confidence.
  const comparables: Comparable[] = insufficient ? [] : evidence.sources.map(value => {
    const source = record(value);
    if (source.originalCurrency !== "NZD") throw new ApiError("VALUATION_FAILED");
    return {
      title: text(source.title),
      price: number(source.priceNZD, Number.MIN_VALUE),
      currency: "NZD",
      source: text(source.platform),
      url: listingUrl(source.url),
    };
  });
  if (!insufficient && (comparables.length === 0 || evidence.filteredCount !== comparables.length)) {
    throw new ApiError("VALUATION_FAILED");
  }
  const estimatedValue = insufficient ? null : number(valuation.estimatedValue, Number.MIN_VALUE);
  const low = insufficient ? null : number(valuation.lowEstimate, Number.MIN_VALUE);
  const high = insufficient ? null : number(valuation.highEstimate, Number.MIN_VALUE);
  if (estimatedValue !== null && low !== null && high !== null &&
      (low > estimatedValue || high < estimatedValue)) throw new ApiError("VALUATION_FAILED");

  const level = insufficient || confidence.level === "LOW" ? "low"
    : confidence.level === "MODERATE" ? "medium"
    : confidence.level === "HIGH" ? "high" : undefined;
  if (!level) throw new ApiError("VALUATION_FAILED");
  const generatedAt = text(result.date);
  if (!Number.isFinite(Date.parse(generatedAt))) throw new ApiError("VALUATION_FAILED");

  return {
    ok: true,
    status: insufficient ? "insufficient_evidence" : "success",
    item: {
      name: text(product.name),
      category: text(product.category),
      ...(typeof product.brand === "string" && product.brand ? { brand: product.brand } : {}),
      ...(typeof product.modelVariant === "string" && product.modelVariant ? { model: product.modelVariant } : {}),
    },
    condition: {
      grade: text(condition.grade),
      // Shared engine uses 0–10; existing Android contract uses 0–100.
      score: Math.round(number(condition.score, 0, 10) * 10),
      notes: [...new Set([...strings(condition.defects), ...strings(condition.issues),
        ...(typeof condition.summary === "string" && condition.summary ? [condition.summary] : [])])],
    },
    valuation: { currency: "NZD", estimatedValue, low, high },
    confidence: { score: insufficient ? 0 : number(confidence.score, 0, 1), level },
    comparables,
    generatedAt,
    warnings: strings(result.warnings ?? []),
  };
}
