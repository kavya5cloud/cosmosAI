import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { workspaceKey } from "@/lib/intel";
import { connectorPlatform } from "@/lib/connectors/shared";

export const runtime = "nodejs";

// Latest Business Events on the bus (the canonical integration contract), newest first.
export async function GET(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 60 : 20, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const tenant = await workspaceKey(req.nextUrl.searchParams.get("wsid"));
  const { bus } = connectorPlatform();
  const cap = Math.min(200, Number(req.nextUrl.searchParams.get("limit")) || 50);
  const events = bus.events(tenant ?? undefined).slice(-cap).reverse();
  return NextResponse.json({ ok: true, events, total: bus.count() });
}
