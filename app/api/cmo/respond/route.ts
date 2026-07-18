import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { workspaceKey } from "@/lib/intel";
import { assembleCmoContext, confidenceOf, type CmoProfile } from "@/lib/services/cmo-context";
import { buildEvidencePack, classifyRequest, decide, renderPrompt, verifyResponse } from "@/lib/cmo/pipeline";
import type { CmoRequest, CmoResponse } from "@/lib/cmo/contracts";
import { buildContentPrompt } from "@/lib/services/content-engine";
import { buildEditPrompt } from "@/lib/services/editor-engine";
import { buildTransformPrompt } from "@/lib/services/transformation-engine";
import { buildAnalysisPrompt } from "@/lib/services/analysis-engine";
import { buildStrategyPrompt } from "@/lib/services/strategy-engine";
import { generateText } from "@/lib/services/llm";

export const runtime = "nodejs";
const responseCache = new Map<string, { expiresAt: number; response: CmoResponse }>();

function keyFor(workspace: string, question: string, contextVersion: string) {
  return createHash("sha256").update(`${workspace}:${contextVersion}:${question}`).digest("hex");
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 30 : 12, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const sql = db();
  if (!sql) return NextResponse.json({ error: "no_database" }, { status: 503 });
  let body: CmoRequest;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_request" }, { status: 400 }); }
  const question = String(body.question || "").trim().slice(0, 2000);
  if (!question) return NextResponse.json({ error: "empty_question" }, { status: 400 });
  const workspace = await workspaceKey(body.wsid ?? null);
  if (!workspace) return NextResponse.json({ error: "no_key" }, { status: 400 });
  try {
    const ctx = await assembleCmoContext(sql, workspace, (body.profile || {}) as CmoProfile, String(body.url || ""));
    const evidence = buildEvidencePack(ctx);
    const routed = classifyRequest({ ...body, question });
    const decision = decide(ctx, evidence);
    const contextVersion = [ctx.missions.length, ctx.whatWorked.length, ctx.dismissed.length, ctx.latestMetrics?.capturedAt || "none"].join(":");
    const cacheKey = keyFor(workspace, question, contextVersion);
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return NextResponse.json({ ...cached.response, cached: true });
    const asset = routed.asset || "x_post";
    const prompt = routed.intent === "content"
      ? buildContentPrompt(ctx, asset, question)
      : routed.intent === "edit" && body.source
        ? buildEditPrompt(ctx, question, body.source)
        : routed.intent === "transform" && body.source && routed.target
          ? buildTransformPrompt(ctx, routed.target, body.source)
          : routed.intent === "analysis"
            ? buildAnalysisPrompt(ctx, question, String(body.recentTurns || "").slice(0, 4000))
            : routed.intent === "campaign"
              ? buildStrategyPrompt(ctx, question, String(body.recentTurns || "").slice(0, 4000))
              : renderPrompt({ ...body, question }, routed, decision, evidence);
    // Render via the LLM service directly — no HTTP self-call. Context is already in the
    // prompt (assembled state), so we don't re-scrape the URL here.
    let rendered = "";
    if (decision.status === "recommended") {
      const gen = await generateText({ prompt, sql });
      if (!gen.ok) throw new Error(gen.error);
      rendered = gen.text;
    }
    const text = verifyResponse(rendered, decision, evidence);
    const response: CmoResponse = { text, intent: routed.intent, confidence: confidenceOf(ctx.signals), decision, evidence: Object.values(evidence).flat(), cached: false };
    responseCache.set(cacheKey, { response, expiresAt: Date.now() + 60_000 });
    console.info(JSON.stringify({ event: "cmo_response", workspace, intent: routed.intent, decision: decision.status, confidence: response.confidence, evidence: response.evidence.length, cached: false }));
    return NextResponse.json(response);
  } catch (error) {
    console.info(JSON.stringify({ event: "cmo_response_error", workspace, detail: String(error).slice(0, 200) }));
    return NextResponse.json({ error: "cmo_response_failed" }, { status: 502 });
  }
}
