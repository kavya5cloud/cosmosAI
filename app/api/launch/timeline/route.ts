import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { workspaceKey } from "@/lib/intel";
import { NeonLaunchRepo } from "@/lib/launch/store";

export const runtime = "nodejs";

// Launch timeline — the week-by-week view of a persisted launch.
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
    return NextResponse.json({ ok: true, launchId, timelineDays: rec.plan.timelineDays, weeks: rec.plan.weeks, summary: rec.plan.summary });
  } catch (e) {
    return NextResponse.json({ error: "timeline_failed", detail: String(e).slice(0, 150) }, { status: 502 });
  }
}
