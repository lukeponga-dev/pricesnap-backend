import { ApiError } from "../api/errors";
import { identifyItem, normalizeValue } from "./identification";
import { findMarketEvidence } from "./evidence";
import { calculateValuation } from "./pricing";
import { calculateConfidence } from "./confidence";
import { getEvidenceModel, getModel, getVisionModel } from "./ai/client";
import type { AppraisalResponse } from "./types";

export interface EngineOptions { signal?: AbortSignal; requestId?: string }
export interface EngineDependencies {
  identify: typeof identifyItem;
  evidence: typeof findMarketEvidence;
}

type Stage = "identify" | "evidence" | "pricing";

interface ProviderFailure {
  status?: number;
  code?: string;
  name?: string;
}

function providerFailure(error: unknown): ProviderFailure {
  const queue: unknown[] = [error];
  const seen = new Set<object>();
  let name: string | undefined;

  for (let depth = 0; queue.length && depth < 8; depth += 1) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    const value = current as Record<string, unknown>;
    if (!name && typeof value.name === "string") name = value.name.slice(0, 64);

    const numericStatus = typeof value.status === "number" ? value.status
      : typeof value.statusCode === "number" ? value.statusCode
      : typeof value.code === "number" ? value.code : undefined;
    const rawCode = typeof value.code === "string" ? value.code
      : typeof value.status === "string" ? value.status : undefined;
    const code = rawCode?.slice(0, 64);

    if (numericStatus || code) {
      const mappedStatus = numericStatus ??
        (code === "RESOURCE_EXHAUSTED" ? 429 :
         code === "UNAUTHENTICATED" ? 401 :
         code === "PERMISSION_DENIED" ? 403 :
         code === "NOT_FOUND" ? 404 : undefined);
      return { status: mappedStatus, code, name };
    }

    // Google GenAI errors may wrap HTTP/provider details in one of these fields.
    for (const key of ["error", "cause", "response"]) {
      if (value[key]) queue.push(value[key]);
    }
  }
  return { name };
}

function safeProviderError(error: unknown): Record<string, unknown> {
  const failure = providerFailure(error);
  return {
    errorName: failure.name ?? (error === null ? "null" : typeof error),
    ...(failure.status === undefined ? {} : { providerStatus: failure.status }),
    ...(failure.code === undefined ? {} : { providerCode: failure.code }),
  };
}

function logStage(
  level: "info" | "error",
  requestId: string,
  stage: Stage | "engine",
  event: "start" | "success" | "failure",
  startedAt: number,
  model: string,
  details: Record<string, unknown> = {},
): void {
  const entry = JSON.stringify({
    event: "valuation_stage",
    requestId,
    stage,
    status: event,
    durationMs: Date.now() - startedAt,
    model,
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
    logStage("info", requestId, "identify", "start", identifyStartedAt, getVisionModel());
    let identified;
    try {
      identified = await dependencies.identify(imageBase64, mimeType, controller.signal);
      logStage("info", requestId, "identify", "success", identifyStartedAt, getVisionModel(), {
        identificationConfidence: identified.identificationConfidence,
      });
    } catch (error) {
      logStage("error", requestId, "identify", "failure", identifyStartedAt, getVisionModel(), safeProviderError(error));
      throw error;
    }

    controller.signal.throwIfAborted();
    if (!normalizeValue(identified.item.name) || identified.identificationConfidence < 0.5) {
      throw new ApiError("IDENTIFICATION_UNCERTAIN");
    }

    const evidenceStartedAt = Date.now();
    logStage("info", requestId, "evidence", "start", evidenceStartedAt, getEvidenceModel());
    let evidence;
    try {
      evidence = await dependencies.evidence(identified, controller.signal);
      logStage("info", requestId, "evidence", "success", evidenceStartedAt, getEvidenceModel(), {
        comparableCount: evidence.comparables.length,
      });
    } catch (error) {
      logStage("error", requestId, "evidence", "failure", evidenceStartedAt, getEvidenceModel(), safeProviderError(error));
      throw error;
    }

    controller.signal.throwIfAborted();
    const pricingStartedAt = Date.now();
    logStage("info", requestId, "pricing", "start", pricingStartedAt, "deterministic");
    const enough = evidence.comparables.length >= 2;
    const valuation = enough ? calculateValuation(evidence.comparables)
      : { currency: "NZD" as const, estimatedValue: null, low: null, high: null };
    logStage("info", requestId, "pricing", "success", pricingStartedAt, "deterministic", {
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
    logStage("info", requestId, "engine", "success", engineStartedAt, getModel(), { outcome: result.status });
    return result;
  } catch (error) {
    logStage("error", requestId, "engine", "failure", engineStartedAt, getModel(), safeProviderError(error));
    if (controller.signal.aborted) throw new ApiError("ANALYSIS_TIMEOUT");
    if (error instanceof ApiError) throw error;
    const failure = providerFailure(error);
    if (failure.status === 429) throw new ApiError("PROVIDER_RATE_LIMIT");
    if (failure.status === 401 || failure.status === 403) throw new ApiError("SERVICE_NOT_CONFIGURED");
    throw new ApiError("VALUATION_FAILED");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
export const valuateImage = runEngine;
