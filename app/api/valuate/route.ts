import { NextRequest, NextResponse } from "next/server";
import { valuateImage } from "@/lib/valuation-engine";
import type { ImageRequest } from "@/lib/valuation-engine/types";

export async function POST(request: NextRequest) {
  let body: ImageRequest;

  try {
    body = (await request.json()) as ImageRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!body.imageBase64) {
    return NextResponse.json({ error: "Image is required" }, { status: 400 });
  }

  try {
    const appraisal = await valuateImage(body.imageBase64);
    return NextResponse.json(appraisal);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Valuation failed";

    if (message.includes("AI_API_KEY")) {
      return NextResponse.json({ error: message }, { status: 500 });
    }

    if (message.includes("Insufficient market evidence")) {
      return NextResponse.json({ error: message }, { status: 422 });
    }

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
