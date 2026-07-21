import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { connectorPlatform } from "@/lib/connectors/shared";
import { CONNECTOR_IDS, type ConnectorId } from "@/lib/connectors/types";

export const runtime = "nodejs";

// disconnect a connector. OAuth is abstracted — reference adapters connect deterministically.
export async function POST(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 30 : 8, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_request" }, { status: 400 }); }
  const id = String(body.connector || "");
  if (!(CONNECTOR_IDS as readonly string[]).includes(id)) return NextResponse.json({ error: "invalid_connector", hint: CONNECTOR_IDS.join(", ") }, { status: 422 });

  const c = connectorPlatform().registry.get(id as ConnectorId)!;
  const status = await c.disconnect();
  return NextResponse.json({ ok: true, status });
}
