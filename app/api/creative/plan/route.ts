import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { workspaceKey } from "@/lib/intel";
import { getCampaign } from "@/lib/services/campaigns";
import { planAssets } from "@/lib/creative/asset-planner";
import { campaignToPlannerInput, normalizePlannerInput } from "@/lib/creative/pipeline";

export const runtime = "nodejs";

// Asset Planner API — deterministic, no LLM. Given a Mission + Campaign + Creative Brief
// (either by campaignId from the existing pipeline, or inline) it returns a structured
// AssetPlan: the ordered set of deliverables with stages, dependencies and rationale.
export async function POST(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 40 : 15, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_request" }, { status: 400 }); }

  try {
    // Preferred path: plan straight from a persisted campaign (Mission → Campaign → Brief).
    const campaignId = String(body.campaignId || "");
    if (/^[0-9a-f-]{36}$/i.test(campaignId)) {
      const sql = db();
      if (!sql) return NextResponse.json({ error: "no_database" }, { status: 503 });
      const key = await workspaceKey((body.wsid as string) ?? null);
      if (!key) return NextResponse.json({ error: "no_key" }, { status: 400 });
      const row = await getCampaign(sql, key, campaignId);
      if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const plan = planAssets(campaignToPlannerInput(row, body.mission as string | undefined));
      console.info(JSON.stringify({ event: "creative_plan_api", source: "campaign", campaignId, assets: plan.summary.total }));
      return NextResponse.json({ ok: true, plan });
    }

    // Inline path: explicit mission/campaign/brief in the body.
    const input = normalizePlannerInput(body);
    if (!input) return NextResponse.json({ error: "invalid_input", hint: "provide campaignId, or a campaign with a goal/title" }, { status: 422 });
    const plan = planAssets(input);
    console.info(JSON.stringify({ event: "creative_plan_api", source: "inline", goal: input.campaign.goal, assets: plan.summary.total }));
    return NextResponse.json({ ok: true, plan });
  } catch (e) {
    console.info(JSON.stringify({ event: "creative_plan_error", detail: String(e).slice(0, 200) }));
    return NextResponse.json({ error: "plan_failed" }, { status: 502 });
  }
}
