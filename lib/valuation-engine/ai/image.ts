/**
 * Image payload helpers for the vision model.
 *
 * Android may send either a data URL or raw base64. Gemini needs the bare
 * base64 bytes plus an explicit MIME type.
 */
export function parseImageBase64(imageBase64: string, providedMimeType: string): {
  data: string;
  mimeType: string;
} {
  const match = imageBase64.match(
    /^data:(image\/(?:jpeg|png|webp));base64,([\s\S]+)$/,
  );

  if (match) {
    return { mimeType: match[1], data: match[2] };
  }

  return { mimeType: providedMimeType, data: imageBase64 };
}
