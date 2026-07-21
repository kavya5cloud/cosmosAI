import { NextRequest, NextResponse } from "next/server";
import { jobEngine } from "@/lib/jobs/shared";

export const runtime = "nodejs";

// Job snapshot + live progress (state, percent, stage, ETA, queue position, cost, refs).
// This is the polling endpoint the AI Processing experience reads real progress from.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const engine = jobEngine();
  const job = engine.getJob(id);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, job, progress: engine.progress(id) });
}
