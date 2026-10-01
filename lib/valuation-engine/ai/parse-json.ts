// Model responses sometimes wrap JSON in markdown fences.
export function parseModelJson<T>(text: string | undefined): T {
  if (!text?.trim()) {
    throw new Error("Model returned an empty response");
  }

  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fenced?.[1]?.trim() ?? trimmed;

  return JSON.parse(payload) as T;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
