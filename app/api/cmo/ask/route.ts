import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { workspaceKey } from "@/lib/intel";
import { assembleCmoContext, buildCmoPrompt, confidenceOf, type CmoProfile } from "@/lib/services/cmo-context";

export const runtime = "nodejs";

// CMO reasoning pipeline (deterministic half). Assembles the business state graph from
// the workspace's own decision/outcome history — no LLM here — and returns a decide-first
// prompt. The client sends that prompt to /api/generate for the final rendering, so all
// the provider fallback + caching logic stays in one place.
export async function POST(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 30 : 12, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }
  const sql = db();
  if (!sql) return NextResponse.json({ enabled: false });

  let body: { wsid?: string; url?: string; profile?: CmoProfile; question?: string; mode?: string; recentTurns?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const key = await workspaceKey(body.wsid ?? null);
  if (!key) return NextResponse.json({ error: "no_key" }, { status: 400 });
  const question = String(body.question || "").trim();
  if (!question) return NextResponse.json({ error: "empty_question" }, { status: 400 });
  const mode = body.mode === "copy" ? "copy" : "strategy";

  try {
    const ctx = await assembleCmoContext(sql, key, body.profile || {}, String(body.url || ""));
    const prompt = buildCmoPrompt(ctx, question.slice(0, 2000), mode, String(body.recentTurns || "").slice(0, 4000));
    const confidence = confidenceOf(ctx.signals);
    console.info(JSON.stringify({
      event: "cmo_ask", wsKey: key, confidence,
      signals: ctx.signals, missions: ctx.missions.length, worked: ctx.whatWorked.length,
    }));
    return NextResponse.json({ ok: true, prompt, confidence, signals: ctx.signals });
  } catch (e) {
    console.info(JSON.stringify({ event: "cmo_ask_error", detail: String(e).slice(0, 200) }));
    return NextResponse.json({ error: "assemble_failed" }, { status: 502 });
  }
}
