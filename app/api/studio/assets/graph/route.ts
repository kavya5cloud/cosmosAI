import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { workspaceKey } from "@/lib/intel";
import { listAssets } from "@/lib/services/assets";
import { buildAssetGraph, subtree, ancestorsOf } from "@/lib/services/asset-graph";
import { ensureCampaignTables } from "@/lib/services/campaigns";

export const runtime = "nodejs";

// Get / traverse the Asset Graph for a campaign. Returns the structured, traversable
// graph (nodes + parent/child edges + version history). With ?rootId= it returns that
// node's subtree and ancestors — an explicit graph traversal. Workspace-scoped.
export async function GET(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 40 : 15, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }
  const sql = db();
  if (!sql) return NextResponse.json({ enabled: false });

  const key = await workspaceKey(req.nextUrl.searchParams.get("wsid"));
  if (!key) return NextResponse.json({ error: "no_key" }, { status: 400 });
  const campaignId = String(req.nextUrl.searchParams.get("campaignId") || "");
  if (!/^[0-9a-f-]{36}$/i.test(campaignId)) return NextResponse.json({ error: "decision_required", hint: "assets live inside a campaign" }, { status: 400 });

  try {
    // Ownership: the campaign must belong to this workspace (listAssets is workspace-scoped too).
    await ensureCampaignTables(sql);
    const owns = (await sql`SELECT 1 FROM campaigns WHERE id = ${campaignId} AND workspace_key = ${key}`) as unknown[];
    if (!owns.length) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const rows = await listAssets(sql, key, campaignId);
    const graph = buildAssetGraph(campaignId, rows);

    const rootId = req.nextUrl.searchParams.get("rootId");
    if (rootId) {
      if (!graph.byId[rootId]) return NextResponse.json({ error: "asset_not_found" }, { status: 404 });
      return NextResponse.json({ ok: true, campaignId, traversal: { rootId, subtree: subtree(graph, rootId), ancestors: ancestorsOf(graph, rootId) } });
    }
    return NextResponse.json({ ok: true, graph });
  } catch (e) {
    return NextResponse.json({ error: "graph_failed", detail: String(e).slice(0, 150) }, { status: 502 });
  }
}
