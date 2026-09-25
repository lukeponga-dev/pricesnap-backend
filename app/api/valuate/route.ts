/**
 * POST /api/valuate
 *
 * Thin HTTP adapter for the Android app (and other clients).
 * All appraisal logic lives in `lib/valuation-engine` — this file only
 * validates the request body, calls `valuateImage`, and maps errors to HTTP.
 *
 * Never put AI keys or provider SDKs here; clients only know this backend URL.
 */
import { NextRequest, NextResponse } from "next/server";
import { valuateImage } from "@/lib/valuation-engine";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Clients send either raw base64 or a data-URL (`data:image/...;base64,...`).
    if (!body.imageBase64 || typeof body.imageBase64 !== "string") {
      return NextResponse.json(
        { error: "imageBase64 is required" },
        { status: 400 },
      );
    }

    const appraisal = await valuateImage(body.imageBase64);
    return NextResponse.json(appraisal);
  } catch (error) {
    // Log the real failure server-side; keep the client message generic
    // so provider/API details are not leaked.
    console.error("Valuation error:", error);

    return NextResponse.json(
      { error: "Unable to complete valuation" },
      { status: 500 },
    );
  }
}
