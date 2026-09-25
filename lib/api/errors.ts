export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_IMAGE"
  | "INVALID_MIME_TYPE"
  | "IMAGE_TOO_LARGE"
  | "UNAUTHORIZED"
  | "INSUFFICIENT_EVIDENCE"
  | "VALUATION_FAILED";

export interface ApiErrorResponse {
  error: string;
  code: ApiErrorCode;
}

const errors: Record<ApiErrorCode, { status: number; error: string }> = {
  INVALID_REQUEST: { status: 400, error: "Invalid request" },
  INVALID_IMAGE: { status: 400, error: "Invalid image" },
  INVALID_MIME_TYPE: { status: 400, error: "Unsupported image MIME type" },
  IMAGE_TOO_LARGE: { status: 413, error: "Image is too large" },
  UNAUTHORIZED: { status: 401, error: "Authentication required" },
  INSUFFICIENT_EVIDENCE: { status: 422, error: "Insufficient market evidence" },
  VALUATION_FAILED: { status: 502, error: "Unable to complete valuation" },
};

export class ApiError extends Error {
  constructor(public readonly code: ApiErrorCode) {
    super(code);
    this.name = "ApiError";
  }
}

export function apiErrorResponse(error: unknown): Response {
  const code = error instanceof ApiError ? error.code : "VALUATION_FAILED";
  const definition = errors[code];
  const body: ApiErrorResponse = { error: definition.error, code };
  return Response.json(body, { status: definition.status });
}
