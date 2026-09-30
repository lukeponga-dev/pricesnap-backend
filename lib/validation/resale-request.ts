import { ApiError } from "../api/errors";
import { validateValuateRequest, type ValuateRequest } from "./valuate-request";
import type { ResalePreferences } from "../resale-agent/types";

export interface ResaleRequest extends ValuateRequest {
  preferences: ResalePreferences;
}

export function validateResaleRequest(body: unknown): ResaleRequest {
  const image = validateValuateRequest(body);
  const record = body as Record<string, unknown>;
  if (record.preferences === undefined) return { ...image, preferences: {} };
  if (!record.preferences || typeof record.preferences !== "object" || Array.isArray(record.preferences)) {
    throw new ApiError("INVALID_REQUEST");
  }
  const raw = record.preferences as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!new Set(["marketplace", "notes"]).has(key)) throw new ApiError("INVALID_REQUEST");
  }
  const marketplace = optionalText(raw.marketplace, 80);
  const notes = optionalText(raw.notes, 500);
  return { ...image, preferences: { marketplace, notes } };
}

function optionalText(value: unknown, maximum: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new ApiError("INVALID_REQUEST");
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximum) throw new ApiError("INVALID_REQUEST");
  return trimmed;
}
