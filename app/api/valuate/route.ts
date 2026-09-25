import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiErrorResponse } from "../../../lib/api/errors";
import { validateValuateRequest } from "../../../lib/validation/valuate-request";

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      if (error instanceof SyntaxError) throw new ApiError("INVALID_REQUEST");
      throw error;
    }
    validateValuateRequest(body);

    return NextResponse.json(
      {
        item: {
          name: "Test Item",
          category: "Unknown",
        },
        condition: {
          grade: "Good",
          score: 75,
          notes: ["Test valuation"],
        },
        valuation: {
          currency: "NZD",
          estimatedValue: 100,
          low: 80,
          high: 120,
        },
        confidence: {
          score: 0.5,
          level: "medium",
        },
        comparables: [],
        generatedAt: new Date().toISOString(),
      },
    );
  } catch (error) {
    if (!(error instanceof ApiError)) {
      console.error("PriceSnap valuation error:", error);
    }
    return apiErrorResponse(error);
  }
}
