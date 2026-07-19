import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { workspaceKey } from "@/lib/intel";
import { NeonLaunchRepo } from "@/lib/launch/store";
import { buildTimeline } from "@/lib/launch/timeline";
import { buildPublishingSchedule } from "@/lib/launch/engine";
import { analyzeLaunch } from "@/lib/launch/recommendations";

export const runtime = "nodejs";

// Launch update — in-place edits to a persisted plan that don't change its identity:
// rename the mission/objectives, or re-time the launch (recompute timeline + publishing
// schedule for a new timelineDays). Structural changes go through /create.
export async function POST(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 20 : 8, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const sql = db();
  if (!sql) return NextResponse.json({ error: "no_database" }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_request" }, { status: 400 }); }
  const key = await workspaceKey((body.wsid as string) ?? null);
  if (!key) return NextResponse.json({ error: "no_key" }, { status: 400 });
  const launchId = String(body.launchId || "");
  if (!launchId) return NextResponse.json({ error: "missing_launchId" }, { status: 422 });

  try {
    const repo = new NeonLaunchRepo(sql);
    const rec = await repo.get(key, launchId);
    if (!rec) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const plan = rec.plan;

    if (typeof body.mission === "string" && body.mission.trim()) plan.mission = body.mission.trim();
    if (Array.isArray(body.objectives)) {
      plan.objectives = body.objectives.map((s, i) => ({ id: `obj_${i}`, statement: String(s) }));
    }
    if (typeof body.timelineDays === "number" && body.timelineDays >= 7) {
      plan.timelineDays = Math.round(body.timelineDays);
      plan.weeks = buildTimeline(plan.campaigns, plan.timelineDays);
      // Re-time the schedule but preserve any publishing progress already made.
      const priorStage = new Map(plan.publishingSchedule.map((s) => [s.assetKey, s.stage]));
      plan.publishingSchedule = buildPublishingSchedule(plan.campaigns, plan.timelineDays)
        .map((s) => ({ ...s, stage: priorStage.get(s.assetKey) ?? s.stage }));
      plan.summary.weekCount = plan.weeks.length;
    }

    const saved = await repo.save(key, plan);
    return NextResponse.json({ ok: true, plan: saved.plan, recommendations: analyzeLaunch(saved.plan) });
  } catch (e) {
    return NextResponse.json({ error: "update_failed", detail: String(e).slice(0, 150) }, { status: 502 });
  }
}
