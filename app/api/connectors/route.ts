import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { connectorPlatform } from "@/lib/connectors/shared";

export const runtime = "nodejs";

// List all connectors with their capabilities + current status.
export async function GET(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 60 : 20, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const { registry } = connectorPlatform();
  const connectors = registry.list().map((c) => ({ capabilities: c.capabilities(), status: c.status() }));
  return NextResponse.json({ ok: true, connectors });
}
