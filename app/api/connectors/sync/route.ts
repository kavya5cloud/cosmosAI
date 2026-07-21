import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { workspaceKey } from "@/lib/intel";
import { connectorPlatform } from "@/lib/connectors/shared";
import { CONNECTOR_IDS, type ConnectorId, type SyncMode } from "@/lib/connectors/types";

export const runtime = "nodejs";

const MODES: SyncMode[] = ["scheduled", "manual", "incremental", "historical"];

// Run a sync — one connector or all connected connectors. The connector polls, normalizes
// and publishes Business Events onto the bus (downstream Learning + Business Graph
// subscribers consume them). Returns the sync run(s).
export async function POST(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 30 : 8, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_request" }, { status: 400 }); }

  const tenant = (await workspaceKey((body.wsid as string) ?? null)) ?? "default";
  const mode = (MODES.includes(body.mode as SyncMode) ? body.mode : "incremental") as SyncMode;
  const { sync, bus } = connectorPlatform();

  const id = String(body.connector || "");
  if (id) {
    if (!(CONNECTOR_IDS as readonly string[]).includes(id)) return NextResponse.json({ error: "invalid_connector" }, { status: 422 });
    const run = await sync.sync(id as ConnectorId, tenant, mode);
    return NextResponse.json({ ok: true, runs: [run], totalEvents: bus.count() });
  }
  const runs = await sync.syncAll(tenant, mode);
  return NextResponse.json({ ok: true, runs, totalEvents: bus.count() });
}
