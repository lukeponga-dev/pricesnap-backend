import { GoogleGenAI } from "@google/genai";

/** Fast multimodal Gemini model for identification and market interpretation. */
export const MODEL = "gemini-flash-latest";

let client: GoogleGenAI | null = null;

/**
 * Server-side only. Reads AI_API_KEY (preferred) or GEMINI_API_KEY / GOOGLE_API_KEY.
 * Never expose this to Android / Retrofit / client builds.
 */
export function getAiClient(): GoogleGenAI {
  if (client) return client;

  const apiKey =
    process.env.AI_API_KEY ??
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing AI_API_KEY. Add it to .env.local on the PriceSnap backend only.",
    );
  }

  client = new GoogleGenAI({ apiKey });
  return client;
}
