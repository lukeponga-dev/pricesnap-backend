/**
 * Image payload helpers for the vision model.
 *
 * Android may send either a data URL or raw base64. Gemini needs the bare
 * base64 bytes plus an explicit MIME type.
 */
export function parseImageBase64(imageBase64: string): {
  data: string;
  mimeType: string;
} {
  const match = imageBase64.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/,
  );

  if (match) {
    return { mimeType: match[1], data: match[2] };
  }

  // No prefix — assume JPEG (common for camera captures). Prefer data URLs
  // when the client knows PNG/WebP so MIME stays accurate.
  return { mimeType: "image/jpeg", data: imageBase64 };
}
