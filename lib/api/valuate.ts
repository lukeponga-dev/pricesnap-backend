import { ApiError, apiErrorResponse } from "./errors";
import { validateValuateRequest } from "../validation/valuate-request";
import { valuateImage } from "../valuation-engine";

export function createValuateHandler(engine = valuateImage) {
  return async (request: Request): Promise<Response> => {
    try {
      let body: unknown;
      try {
        body = await request.json();
      } catch (error) {
        if (error instanceof SyntaxError) throw new ApiError("INVALID_REQUEST");
        throw error;
      }
      const input = validateValuateRequest(body);
      const result = await engine(input.imageBase64, input.mimeType, {
        signal: request.signal,
      });
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      // Never log the photo, provider response, or credentials.
      return apiErrorResponse(error);
    }
  };
}

