import { ApiError, apiErrorResponse } from "./errors";
import { createResalePlan } from "../resale-agent";
import { validateResaleRequest } from "../validation/resale-request";
import { valuateImage } from "../valuation-engine";
import { enforceProviderAccess } from "./access";

export function createResaleHandler(
  engine = valuateImage,
  planner = createResalePlan,
  authorize: (request: Request) => Promise<void> = enforceProviderAccess,
) {
  return async (request: Request): Promise<Response> => {
    try {
      // Gate the entire paid resale workflow before valuation or listing-provider work.
      await authorize(request);

      let body: unknown;
      try {
        body = await request.json();
      } catch (error) {
        if (error instanceof SyntaxError) throw new ApiError("INVALID_REQUEST");
        throw error;
      }
      const input = validateResaleRequest(body);
      const valuation = await engine(input.imageBase64, input.mimeType, { signal: request.signal });
      const result = await planner(valuation, input.preferences, { signal: request.signal });
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return apiErrorResponse(error);
    }
  };
}
