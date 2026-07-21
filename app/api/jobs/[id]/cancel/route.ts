import { NextRequest, NextResponse } from "next/server";
import { jobEngine } from "@/lib/jobs/shared";

export const runtime = "nodejs";

// cancel a job (event-driven control operation).
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const engine = jobEngine();
  if (!engine.getJob(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const ok = engine.cancel(id);
  return NextResponse.json({ ok, job: engine.getJob(id) }, { status: ok ? 200 : 409 });
}
