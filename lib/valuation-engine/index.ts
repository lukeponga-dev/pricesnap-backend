import { ApiError } from "../api/errors";
import { identifyItem, normalizeValue } from "./identification";
import { findMarketEvidence } from "./evidence";
import { calculateValuation } from "./pricing";
import { calculateConfidence } from "./confidence";
import type { AppraisalResponse } from "./types";

export interface EngineOptions { signal?: AbortSignal }
export interface EngineDependencies {
  identify: typeof identifyItem;
  evidence: typeof findMarketEvidence;
}

/** All recognition, search and pricing execute in this backend. */
export async function runEngine(
  imageBase64: string,
  mimeType = "image/jpeg",
  options: EngineOptions = {},
  dependencies: EngineDependencies = { identify: identifyItem, evidence: findMarketEvidence },
): Promise<AppraisalResponse> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, 95_000);
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  try {
    controller.signal.throwIfAborted();
    const identified = await dependencies.identify(imageBase64, mimeType, controller.signal);
    controller.signal.throwIfAborted();
    if (!normalizeValue(identified.item.name) || identified.identificationConfidence < 0.5) {
      throw new ApiError("IDENTIFICATION_UNCERTAIN");
    }
    const evidence = await dependencies.evidence(identified, controller.signal);
    controller.signal.throwIfAborted();
    const enough = evidence.comparables.length >= 2;
    const valuation = enough ? calculateValuation(evidence.comparables)
      : { currency: "NZD" as const, estimatedValue: null, low: null, high: null };
    return {
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
  } catch (error) {
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
