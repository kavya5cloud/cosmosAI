import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { workspaceKey } from "@/lib/intel";
import { NeonLaunchRepo } from "@/lib/launch/store";
import { runExperiment } from "@/lib/launch/experiments";

export const runtime = "nodejs";

// Launch experiments — list a launch's experiments (GET) or record results and decide a
// winner (POST). Winner selection is deterministic (highest metric, margin-based confidence).
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

  const rec = await new NeonLaunchRepo(sql).get(key, launchId);
  if (!rec) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, experiments: rec.plan.experiments });
}

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
  const experimentId = String(body.experimentId || "");
  const results = Array.isArray(body.results) ? body.results as { variantId: string; metric: number }[] : [];
  if (!launchId || !experimentId || results.length < 1) {
    return NextResponse.json({ error: "invalid", hint: "launchId, experimentId and results[] required" }, { status: 422 });
  }

  try {
    const repo = new NeonLaunchRepo(sql);
    const rec = await repo.get(key, launchId);
    if (!rec) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const plan = rec.plan;
    const idx = plan.experiments.findIndex((e) => e.id === experimentId);
    if (idx < 0) return NextResponse.json({ error: "experiment_not_found" }, { status: 404 });

    const decided = runExperiment(plan.experiments[idx], results, { minConfidence: typeof body.minConfidence === "number" ? body.minConfidence : undefined });
    plan.experiments[idx] = decided;
    await repo.save(key, plan);
    return NextResponse.json({ ok: true, experiment: decided });
  } catch (e) {
    return NextResponse.json({ error: "experiment_failed", detail: String(e).slice(0, 150) }, { status: 502 });
  }
}
