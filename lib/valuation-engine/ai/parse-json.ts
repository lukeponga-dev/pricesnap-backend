/**
 * Small utilities shared by identification / evidence parsing.
 */

/**
 * Parse JSON from a model response, tolerating optional markdown fences.
 */
export function parseModelJson<T>(text: string | undefined): T {
  if (!text?.trim()) {
    throw new Error("Model returned an empty response");
  }

  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fenced?.[1]?.trim() ?? trimmed;

  return JSON.parse(payload) as T;
}

/** Clamp a number into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
