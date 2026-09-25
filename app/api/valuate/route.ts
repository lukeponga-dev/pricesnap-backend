import { NextRequest, NextResponse } from "next/server";
import type { ImageRequest } from "@/lib/valuation-engine/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ImageRequest;

    if (!body.imageBase64 || typeof body.imageBase64 !== "string") {
      return NextResponse.json(
        {
          error: "imageBase64 is required",
        },
        { status: 400 },
      );
    }

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
  } catch {
    return NextResponse.json(
      {
        error: "Invalid request",
      },
      { status: 400 },
    );
  }
}
