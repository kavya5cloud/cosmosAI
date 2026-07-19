import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { workspaceKey } from "@/lib/intel";
import { NeonLaunchRepo } from "@/lib/launch/store";
import { flagDependents, upstreamOf } from "@/lib/launch/dependencies";

export const runtime = "nodejs";

// Launch dependencies — the derivation graph. With ?changed=<assetKey> it returns every
// downstream asset that must be revisited when that asset changes (Part 4).
export async function GET(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 60 : 20, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const sql = db();
  if (!sql) return NextResponse.json({ enabled: false });
  const key = await workspaceKey(req.nextUrl.searchParams.get("wsid"));
  if (!key) return NextResponse.json({ error: "no_key" }, { status: 400 });
  const launchId = String(req.nextUrl.searchParams.get("launchId") || "");
  if (!launchId) return NextResponse.json({ error: "missing_launchId" }, { status: 422 });

  try {
    const rec = await new NeonLaunchRepo(sql).get(key, launchId);
    if (!rec) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const graph = rec.plan.dependencies;

    const changed = req.nextUrl.searchParams.get("changed");
    if (changed) {
      if (!graph.byKey[changed]) return NextResponse.json({ error: "unknown_asset" }, { status: 404 });
      return NextResponse.json({
        ok: true, changed,
        flagged: flagDependents(graph, changed),
        upstream: upstreamOf(graph, changed),
      });
    }
    return NextResponse.json({ ok: true, graph });
  } catch (e) {
    return NextResponse.json({ error: "dependencies_failed", detail: String(e).slice(0, 150) }, { status: 502 });
  }
}
