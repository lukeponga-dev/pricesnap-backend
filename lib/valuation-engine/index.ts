import { ApiError } from "../api/errors";
import { identifyItem, normalizeValue } from "./identification";
import { findMarketEvidence } from "./evidence";
import { calculateValuation } from "./pricing";
import { calculateConfidence } from "./confidence";
import { getModel } from "./ai/client";
import type { AppraisalResponse } from "./types";

export interface EngineOptions { signal?: AbortSignal; requestId?: string }
export interface EngineDependencies {
  identify: typeof identifyItem;
  evidence: typeof findMarketEvidence;
}

type Stage = "identify" | "evidence" | "pricing";

function safeProviderError(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") {
    return { errorType: typeof error };
  }
  const value = error as Record<string, unknown>;
  const status = typeof value.status === "number" ? value.status : undefined;
  const code = typeof value.code === "number" || typeof value.code === "string"
    ? String(value.code).slice(0, 64)
    : undefined;
  const name = typeof value.name === "string" ? value.name.slice(0, 64) : "Error";
  return { errorName: name, ...(status === undefined ? {} : { providerStatus: status }),
    ...(code === undefined ? {} : { providerCode: code }) };
}

function logStage(
  level: "info" | "error",
  requestId: string,
  stage: Stage | "engine",
  event: "start" | "success" | "failure",
  startedAt: number,
  details: Record<string, unknown> = {},
): void {
  const entry = JSON.stringify({
    event: "valuation_stage",
    requestId,
    stage,
    status: event,
    durationMs: Date.now() - startedAt,
    model: getModel(),
    ...details,
  });
  if (level === "error") console.error(entry);
  else console.info(entry);
}

/** All recognition, search and pricing execute in this backend. */
export async function runEngine(
  imageBase64: string,
  mimeType = "image/jpeg",
  options: EngineOptions = {},
  dependencies: EngineDependencies = { identify: identifyItem, evidence: findMarketEvidence },
): Promise<AppraisalResponse> {
  const requestId = options.requestId ?? crypto.randomUUID();
  const engineStartedAt = Date.now();
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, 95_000);
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  try {
    controller.signal.throwIfAborted();

    const identifyStartedAt = Date.now();
    logStage("info", requestId, "identify", "start", identifyStartedAt);
    let identified;
    try {
      identified = await dependencies.identify(imageBase64, mimeType, controller.signal);
      logStage("info", requestId, "identify", "success", identifyStartedAt, {
        identificationConfidence: identified.identificationConfidence,
      });
    } catch (error) {
      logStage("error", requestId, "identify", "failure", identifyStartedAt, safeProviderError(error));
      throw error;
    }

    controller.signal.throwIfAborted();
    if (!normalizeValue(identified.item.name) || identified.identificationConfidence < 0.5) {
      throw new ApiError("IDENTIFICATION_UNCERTAIN");
    }

    const evidenceStartedAt = Date.now();
    logStage("info", requestId, "evidence", "start", evidenceStartedAt);
    let evidence;
    try {
      evidence = await dependencies.evidence(identified, controller.signal);
      logStage("info", requestId, "evidence", "success", evidenceStartedAt, {
        comparableCount: evidence.comparables.length,
      });
    } catch (error) {
      logStage("error", requestId, "evidence", "failure", evidenceStartedAt, safeProviderError(error));
      throw error;
    }

    controller.signal.throwIfAborted();
    const pricingStartedAt = Date.now();
    logStage("info", requestId, "pricing", "start", pricingStartedAt);
    const enough = evidence.comparables.length >= 2;
    const valuation = enough ? calculateValuation(evidence.comparables)
      : { currency: "NZD" as const, estimatedValue: null, low: null, high: null };
    logStage("info", requestId, "pricing", "success", pricingStartedAt, {
      comparableCount: evidence.comparables.length,
      outcome: enough ? "success" : "insufficient_evidence",
    });

    const result: AppraisalResponse = {
      ok: true,
      status: enough ? "success" : "insufficient_evidence",
      item: { name: identified.item.name, category: identified.item.category,
        brand: identified.item.brand, model: identified.item.model },
      condition: identified.condition,
      valuation,
      confidence: calculateConfidence(identified, evidence, valuation),
      comparables: enough ? evidence.comparables.map(({ title, price, currency, source, url }) =>
        ({ title, price, currency, source, url })) : [],
      generatedAt: new Date().toISOString(),
      warnings: [
        "Search evidence can be incomplete or stale; asking prices are not completed sales.",
        "Condition is visual only; functionality is untested. The price band is a heuristic, not a statistical confidence interval.",
        ...(!enough ? ["Not enough grounded NZD comparables to estimate a value."] : []),
      ],
    };
    logStage("info", requestId, "engine", "success", engineStartedAt, { outcome: result.status });
    return result;
  } catch (error) {
    logStage("error", requestId, "engine", "failure", engineStartedAt, safeProviderError(error));
    if (controller.signal.aborted) throw new ApiError("ANALYSIS_TIMEOUT");
    if (error instanceof ApiError) throw error;
    const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
    if (status === 429) throw new ApiError("PROVIDER_RATE_LIMIT");
    if (status === 401 || status === 403) throw new ApiError("SERVICE_NOT_CONFIGURED");
    throw new ApiError("VALUATION_FAILED");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
export const valuateImage = runEngine;
