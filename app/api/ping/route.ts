import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "pricesnap-backend",
    timestamp: Date.now(),
  });
}