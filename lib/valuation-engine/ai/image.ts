/** Strip a data-URL prefix if present and infer MIME type. */
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

  return { mimeType: "image/jpeg", data: imageBase64 };
}
