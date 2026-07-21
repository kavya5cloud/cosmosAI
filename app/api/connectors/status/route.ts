import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { connectorPlatform } from "@/lib/connectors/shared";

export const runtime = "nodejs";

// Connection + health status for every connector, plus sync + bus metrics.
export async function GET(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 60 : 20, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const { registry, sync, bus } = connectorPlatform();
  const statuses = registry.list().map((c) => c.status());
  const health = await registry.health();
  return NextResponse.json({
    ok: true,
    statuses,
    health,
    connected: statuses.filter((s) => s.state === "connected").length,
    due: sync.dueConnectors(),
    events: bus.count(),
    deadLetter: bus.deadLetter.length,
    sync: sync.metrics(),
  });
}
