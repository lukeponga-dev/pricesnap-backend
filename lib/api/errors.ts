export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_IMAGE"
  | "INVALID_MIME_TYPE"
  | "IMAGE_TOO_LARGE"
  | "UNAUTHORIZED"
  | "INSUFFICIENT_EVIDENCE"
  | "SERVICE_NOT_CONFIGURED"
  | "PROVIDER_RATE_LIMIT"
  | "ANALYSIS_TIMEOUT"
  | "IDENTIFICATION_UNCERTAIN"
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
  SERVICE_NOT_CONFIGURED: { status: 503, error: "Valuation service is not configured" },
  PROVIDER_RATE_LIMIT: { status: 429, error: "Valuation service is busy; try again later" },
  ANALYSIS_TIMEOUT: { status: 504, error: "Valuation timed out; try again later" },
  IDENTIFICATION_UNCERTAIN: { status: 422, error: "Unable to identify the item; try a clearer photo" },
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
  return Response.json(body, { status: definition.status, headers: { "Cache-Control": "no-store" } });
}
