import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { jobEngine } from "@/lib/jobs/shared";

export const runtime = "nodejs";

// Execution Dashboard payload — queue metrics, worker health, provider usage, system load
// and the most recent jobs. One call for the cockpit.
export async function GET(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 60 : 20, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const engine = jobEngine();
  return NextResponse.json({
    ok: true,
    metrics: engine.metrics(),
    jobs: engine.listJobs().slice(0, 40).map((j) => ({
      id: j.id, type: j.type, state: j.state, progress: j.progress, priority: j.priority,
      cost: j.cost, attempts: j.attempts, createdAt: j.createdAt,
      durationMs: j.startedAt ? (j.completedAt ?? j.updatedAt) - j.startedAt : null,
    })),
  });
}
