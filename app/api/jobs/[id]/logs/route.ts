import { NextRequest, NextResponse } from "next/server";
import { jobEngine } from "@/lib/jobs/shared";

export const runtime = "nodejs";

// Job logs (append-only execution log).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const engine = jobEngine();
  if (!engine.getJob(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, logs: engine.logs(id) });
}
