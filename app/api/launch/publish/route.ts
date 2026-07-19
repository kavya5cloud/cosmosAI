import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { workspaceKey } from "@/lib/intel";
import { NeonLaunchRepo } from "@/lib/launch/store";
import { PublishingQueue } from "@/lib/launch/publishing";

export const runtime = "nodejs";

// Launch publish — drives assets through the publishing pipeline. Loads the plan's
// publishing schedule into the state machine, applies the action (advance / retry /
// rollback / bulk / advanceAll), then persists the new stages back onto the plan.
type Action = "advance" | "retry" | "rollback" | "bulkAdvance" | "advanceAll";

export async function POST(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 30 : 8, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const sql = db();
  if (!sql) return NextResponse.json({ error: "no_database" }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_request" }, { status: 400 }); }
  const key = await workspaceKey((body.wsid as string) ?? null);
  if (!key) return NextResponse.json({ error: "no_key" }, { status: 400 });
  const launchId = String(body.launchId || "");
  if (!launchId) return NextResponse.json({ error: "missing_launchId" }, { status: 422 });
  const action = String(body.action || "") as Action;

  try {
    const repo = new NeonLaunchRepo(sql);
    const rec = await repo.get(key, launchId);
    if (!rec) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const plan = rec.plan;

    const queue = new PublishingQueue().load(plan.publishingSchedule);
    let results;
    switch (action) {
      case "advance": results = [queue.advance(String(body.assetKey || ""))]; break;
      case "retry": results = [queue.retry(String(body.assetKey || ""))]; break;
      case "rollback": results = [queue.rollback(String(body.assetKey || ""))]; break;
      case "bulkAdvance": results = queue.bulkAdvance(Array.isArray(body.assetKeys) ? body.assetKeys.map(String) : []); break;
      case "advanceAll": results = queue.advanceAll(); break;
      default: return NextResponse.json({ error: "invalid_action", hint: "advance|retry|rollback|bulkAdvance|advanceAll" }, { status: 422 });
    }

    // Persist the new stages back onto the plan's schedule.
    const stageByKey = new Map(queue.all().map((i) => [i.assetKey, i.stage]));
    plan.publishingSchedule = plan.publishingSchedule.map((s) => ({ ...s, stage: stageByKey.get(s.assetKey) ?? s.stage }));
    await repo.save(key, plan);

    console.info(JSON.stringify({ event: "launch_publish", action, changed: results.length }));
    return NextResponse.json({ ok: true, action, results, summary: queue.summary(), publishingSchedule: plan.publishingSchedule });
  } catch (e) {
    return NextResponse.json({ error: "publish_failed", detail: String(e).slice(0, 150) }, { status: 502 });
  }
}
