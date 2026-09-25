/**
 * Gemini client (server-side only).
 *
 * API keys must live in backend env (`.env.local`), never in:
 * Android BuildConfig, local.properties, APK, Retrofit, or GitHub.
 */
import { GoogleGenAI } from "@google/genai";

/** Multimodal model used for identification and provisional evidence retrieval. */
export const MODEL = "gemini-flash-latest";

let client: GoogleGenAI | null = null;

/**
 * Lazy singleton so importing this module does not require the key until used.
 * Uses the Gemini-specific env var name so deployments stay explicit.
 */
export function getAiClient(): GoogleGenAI {
  if (client) return client;

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY. Add it to .env.local on the PriceSnap backend only.",
    );
  }

  client = new GoogleGenAI({ apiKey });
  return client;
}
