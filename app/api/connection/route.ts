import { NextResponse } from "next/server";
import { DEFAULT_ENGINE_URL } from "@/lib/valuation-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startTime = Date.now();
  const configuredEngineUrl = process.env.PRICESNAP_ENGINE_URL || DEFAULT_ENGINE_URL;

  let upstreamHealthUrl = "https://pricesnapai.vercel.app/api/health";
  try {
    const parsed = new URL(configuredEngineUrl);
    // Replace analyze with health if standard structure, else default to /api/health
    if (parsed.pathname.endsWith("/analyze")) {
      parsed.pathname = parsed.pathname.replace(/\/analyze$/, "/health");
    } else {
      parsed.pathname = "/api/health";
    }
    upstreamHealthUrl = parsed.toString();
  } catch {
    // Keep fallback
  }

  let upstreamStatus: {
    connected: boolean;
    status: string;
    statusCode?: number;
    latencyMs?: number;
    service?: string;
    hasApiKey?: boolean;
    engineVersion?: string;
    error?: string;
    healthUrl: string;
  } = {
    connected: false,
    status: "unreachable",
    healthUrl: upstreamHealthUrl,
  };

  const upstreamStart = Date.now();
  try {
    const upstreamRes = await fetch(upstreamHealthUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });

    const latencyMs = Date.now() - upstreamStart;
    upstreamStatus.latencyMs = latencyMs;
    upstreamStatus.statusCode = upstreamRes.status;

    if (upstreamRes.ok) {
      const data = await upstreamRes.json().catch(() => null);
      upstreamStatus = {
        connected: true,
        status: data?.status || "online",
        statusCode: upstreamRes.status,
        latencyMs,
        service: data?.service || "pricesnap-api",
        hasApiKey: Boolean(data?.hasApiKey),
        engineVersion: data?.engineVersion || "unknown",
        healthUrl: upstreamHealthUrl,
      };
    } else {
      upstreamStatus.error = `HTTP ${upstreamRes.status} ${upstreamRes.statusText}`;
      upstreamStatus.status = "degraded";
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Connection failed";
    upstreamStatus = {
      connected: false,
      status: "unreachable",
      latencyMs: Date.now() - upstreamStart,
      error: message,
      healthUrl: upstreamHealthUrl,
    };
  }

  const backendData = {
    status: "online",
    service: "pricesnap-backend",
    version: "0.1.0",
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || "development",
    engineTarget: configuredEngineUrl,
    serverTime: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    clientCheckDurationMs: Date.now() - startTime,
  };

  return NextResponse.json(
    {
      ok: true,
      timestamp: Date.now(),
      backend: backendData,
      upstream: upstreamStatus,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
