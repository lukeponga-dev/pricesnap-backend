import { GoogleGenAI } from "@google/genai";
import { ApiError } from "../../api/errors";

export const ENGINE_VERSION = "internal-1.0.0";
export function getModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";
}
export function hasApiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}
export function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new ApiError("SERVICE_NOT_CONFIGURED");
  return new GoogleGenAI({ apiKey });
}
