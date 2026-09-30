/**
 * Identification step — vision model only.
 *
 * Responsibility: name the item, attributes, and condition from the photo.
 * Explicitly does NOT estimate resale value; pricing comes later from evidence.
 *
 * Prefer the string "Unknown" over inventing model / storage / colour variants.
 */
import {
  createPartFromBase64,
  createPartFromText,
  Type,
} from "@google/genai";
import { getAiClient, getVisionModel, withGeminiRetry } from "../ai/client";
import { parseImageBase64 } from "../ai/image";
import { clamp, parseModelJson } from "../ai/parse-json";
import type { IdentifiedItem } from "../types";

/** Structured-output schema so Gemini returns stable JSON for the pipeline. */
const identifySchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    brand: { type: Type.STRING },
    model: { type: Type.STRING },
    category: { type: Type.STRING },
    attributes: {
      type: Type.OBJECT,
      description:
        "Visible product attributes only. Use the string Unknown when not visible.",
      properties: {
        storage: { type: Type.STRING },
        colour: { type: Type.STRING },
        size: { type: Type.STRING },
        material: { type: Type.STRING },
        year: { type: Type.STRING },
      },
    },
    condition: {
      type: Type.OBJECT,
      properties: {
        grade: {
          type: Type.STRING,
          description: "e.g. Poor, Fair, Good, Very Good, Excellent, Mint",
        },
        score: {
          type: Type.INTEGER,
          description: "Condition score from 0 to 100",
        },
        observations: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
      required: ["grade", "score", "observations"],
    },
    identificationConfidence: {
      type: Type.NUMBER,
      description: "0 to 1 confidence that the item was correctly identified",
    },
  },
  required: [
    "name",
    "category",
    "attributes",
    "condition",
    "identificationConfidence",
  ],
};

/** Raw JSON shape from the model before we normalize into IdentifiedItem. */
interface IdentifyModelResponse {
  name: string;
  brand?: string;
  model?: string;
  category: string;
  attributes?: Record<string, string>;
  condition: {
    grade: string;
    score: number;
    observations: string[];
  };
  identificationConfidence: number;
}

/**
 * Identify the product in `imageBase64` for later market valuation.
 */
export async function identifyItem(
  imageBase64: string,
  providedMimeType: string,
  signal?: AbortSignal,
): Promise<IdentifiedItem> {
  const { data, mimeType } = parseImageBase64(imageBase64, providedMimeType);
  const ai = getAiClient();
  const model = getVisionModel();

  const response = await withGeminiRetry(
    () => ai.models.generateContent({
    model,
    contents: [
      createPartFromText(
        [
          "You are an expert second-hand goods appraiser in New Zealand.",
          "Identify the item in this photo for later market valuation.",
          "Do NOT estimate a resale price.",
          "Only report attributes you can see or that are clearly labeled.",
          "If brand, model, storage, colour, or other variant details are unclear,",
          'set that field to "Unknown" — never invent a specific variant.',
          "Assess condition from visible wear only.",
        ].join(" "),
      ),
      createPartFromBase64(data, mimeType),
    ],
    config: {
      abortSignal: signal,
      responseMimeType: "application/json",
      responseSchema: identifySchema,
    },
  }),
    model,
    signal,
  );

  const parsed = parseModelJson<IdentifyModelResponse>(response.text);
  if (!parsed || typeof parsed.name !== "string" || !parsed.name.trim() ||
      typeof parsed.category !== "string" || !parsed.condition ||
      typeof parsed.condition.grade !== "string" ||
      typeof parsed.condition.score !== "number" || !Number.isFinite(parsed.condition.score) ||
      !Array.isArray(parsed.condition.observations) ||
      !parsed.condition.observations.every(v => typeof v === "string") ||
      typeof parsed.identificationConfidence !== "number" || !Number.isFinite(parsed.identificationConfidence)) {
    throw new Error("Invalid identification response");
  }
  const attributes = normalizeAttributes(parsed.attributes ?? {});

  return {
    item: {
      name: parsed.name,
      // Drop "Unknown" brand/model so the public payload stays clean.
      brand: normalizeValue(parsed.brand),
      model: normalizeValue(parsed.model),
      category: normalizeValue(parsed.category) ?? "Unknown",
      attributes,
    },
    condition: {
      grade: normalizeValue(parsed.condition.grade) ?? "Unknown",
      score: clamp(parsed.condition.score, 0, 100),
      // Map model "observations" onto AppraisalResponse.condition.notes.
      notes: parsed.condition.observations,
    },
    identificationConfidence: clamp(
      parsed.identificationConfidence,
      0,
      1,
    ),
  };
}

export function normalizeValue(value?: string): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = value.trim();
  if (["unknown", "n/a", "unsure"].includes(normalized.toLowerCase())) {
    return undefined;
  }
  return normalized;
}

/** Keep only known, non-empty attribute entries. */
function normalizeAttributes(
  attrs: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    const normalized = normalizeValue(value);
    if (!normalized) continue;
    out[key] = normalized;
  }
  return out;
}

