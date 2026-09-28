import { connectionStatus } from "../../../lib/api/connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const result = connectionStatus();
  return Response.json(result, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
