import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { connectorPlatform } from "@/lib/connectors/shared";
import { CONNECTOR_IDS, type ConnectorId } from "@/lib/connectors/types";

export const runtime = "nodejs";

// Sync history — every run (last/next sync, duration, records processed, events, errors).
export async function GET(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 60 : 20, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const c = req.nextUrl.searchParams.get("connector");
  const connector = c && (CONNECTOR_IDS as readonly string[]).includes(c) ? (c as ConnectorId) : undefined;
  const { sync } = connectorPlatform();
  return NextResponse.json({ ok: true, history: sync.history(connector), metrics: sync.metrics() });
}
