import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { workspaceKey } from "@/lib/intel";
import { createLaunch } from "@/lib/launch/engine";
import { analyzeLaunch } from "@/lib/launch/recommendations";
import { NeonLaunchRepo } from "@/lib/launch/store";
import { LAUNCH_TEMPLATE_IDS } from "@/lib/launch/templates";
import type { LaunchInput, LaunchTemplateId } from "@/lib/launch/types";

export const runtime = "nodejs";

// Launch create — "I'm launching X" → a complete, connected LaunchPlan. Deterministic
// (composes the Asset Planner + Campaign goals + Creative Brief). Persists when a DB is
// present; otherwise returns the computed plan (dry run).
export async function POST(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 20 : 8, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_request" }, { status: 400 }); }

  const launchType = String(body.launchType || "");
  if (!LAUNCH_TEMPLATE_IDS.includes(launchType as LaunchTemplateId)) {
    return NextResponse.json({ error: "invalid_launch_type", hint: `one of: ${LAUNCH_TEMPLATE_IDS.join(", ")}` }, { status: 422 });
  }
  const mission = String(body.mission || "").trim();
  if (!mission) return NextResponse.json({ error: "missing_mission" }, { status: 422 });
  const businessName = String((body.business as { name?: string })?.name || (body.businessName as string) || "").trim();
  if (!businessName) return NextResponse.json({ error: "missing_business" }, { status: 422 });

  const input: LaunchInput = {
    launchType: launchType as LaunchTemplateId,
    mission,
    business: {
      name: businessName,
      audience: (body.business as { audience?: string })?.audience,
      oneLiner: (body.business as { oneLiner?: string })?.oneLiner,
      url: (body.business as { url?: string })?.url,
    },
    goals: Array.isArray(body.goals) ? body.goals.map(String) : undefined,
    budget: typeof body.budget === "number" ? body.budget : undefined,
    timelineDays: typeof body.timelineDays === "number" ? body.timelineDays : undefined,
    audience: typeof body.audience === "string" ? body.audience : undefined,
    channels: Array.isArray(body.channels) ? body.channels.map(String) : undefined,
    brief: (body.brief && typeof body.brief === "object" ? body.brief : undefined) as LaunchInput["brief"],
  };

  try {
    const plan = createLaunch(input);
    const recommendations = analyzeLaunch(plan);

    const sql = db();
    let persisted = false;
    if (sql) {
      const key = await workspaceKey((body.wsid as string) ?? null);
      if (key) { await new NeonLaunchRepo(sql).save(key, plan); persisted = true; }
    }
    console.info(JSON.stringify({ event: "launch_create", launchType, campaigns: plan.summary.campaignCount, assets: plan.summary.assetCount, persisted }));
    return NextResponse.json({ ok: true, persisted, plan, recommendations });
  } catch (e) {
    console.info(JSON.stringify({ event: "launch_create_error", detail: String(e).slice(0, 200) }));
    return NextResponse.json({ error: "create_failed", detail: String(e).slice(0, 150) }, { status: 502 });
  }
}
