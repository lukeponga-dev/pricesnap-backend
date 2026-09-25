import { ApiError } from "../api/errors";
import { parseImageBase64 } from "../valuation-engine/ai/image";

export interface ValuateRequest {
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateValuateRequest(body: unknown): ValuateRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError("INVALID_REQUEST");
  }
  const request = body as Record<string, unknown>;
  if (typeof request.imageBase64 !== "string" || !request.imageBase64) {
    throw new ApiError("INVALID_IMAGE");
  }
  if (typeof request.mimeType !== "string" || !ALLOWED_MIME_TYPES.has(request.mimeType)) {
    throw new ApiError("INVALID_MIME_TYPE");
  }

  const { data, mimeType } = parseImageBase64(request.imageBase64, request.mimeType);
  if (mimeType !== request.mimeType) throw new ApiError("INVALID_MIME_TYPE");
  if (data.length > MAX_BASE64_LENGTH) throw new ApiError("IMAGE_TOO_LARGE");

  // Buffer decoding alone silently accepts invalid characters and padding.
  // Check standard, padded Base64 and its canonical round trip explicitly.
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  const content = data.slice(0, data.length - padding);
  if (!content || data.length % 4 !== 0 || /[^A-Za-z0-9+/]/.test(content)) {
    throw new ApiError("INVALID_IMAGE");
  }
  const byteLength = (data.length / 4) * 3 - padding;
  if (byteLength > MAX_IMAGE_BYTES) throw new ApiError("IMAGE_TOO_LARGE");
  if (Buffer.from(data, "base64").toString("base64") !== data) {
    throw new ApiError("INVALID_IMAGE");
  }

  return { imageBase64: data, mimeType: mimeType as ValuateRequest["mimeType"] };
}
