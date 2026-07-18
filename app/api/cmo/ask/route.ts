import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { workspaceKey } from "@/lib/intel";
import { assembleCmoContext, confidenceOf, type CmoProfile } from "@/lib/services/cmo-context";
import { routeIntent } from "@/lib/services/intent-router";
import { buildContentPrompt } from "@/lib/services/content-engine";
import { buildStrategyPrompt } from "@/lib/services/strategy-engine";
import { buildEditPrompt } from "@/lib/services/editor-engine";
import { buildTransformPrompt } from "@/lib/services/transformation-engine";
import { buildAnalysisPrompt } from "@/lib/services/analysis-engine";

export const runtime = "nodejs";

// The AI Marketing OS entry point. DETERMINISTIC pipeline:
//   message → intent router (rules, no LLM) → shared Business State (assembler) →
//   the matching engine's prompt → client renders per intent.
// The LLM never decides which engine runs, and content requests never get strategy memos.
export async function POST(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 30 : 12, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }
  const sql = db();
  if (!sql) return NextResponse.json({ enabled: false });

  let body: {
    wsid?: string; url?: string; profile?: CmoProfile; question?: string;
    recentTurns?: string; source?: string; hasSelection?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const key = await workspaceKey(body.wsid ?? null);
  if (!key) return NextResponse.json({ error: "no_key" }, { status: 400 });
  const question = String(body.question || "").trim().slice(0, 2000);
  if (!question) return NextResponse.json({ error: "empty_question" }, { status: 400 });

  const source = String(body.source || "").slice(0, 8000);
  const routed = routeIntent(question, !!body.hasSelection && !!source);
  const recentTurns = String(body.recentTurns || "").slice(0, 4000);

  try {
    const ctx = await assembleCmoContext(sql, key, body.profile || {}, String(body.url || ""));

    let prompt: string;
    switch (routed.intent) {
      case "content":
        prompt = buildContentPrompt(ctx, routed.asset ?? "x_post", question);
        break;
      case "edit":
        prompt = source
          ? buildEditPrompt(ctx, question, source)
          : buildContentPrompt(ctx, routed.asset ?? "x_post", question); // nothing to edit → make it
        break;
      case "transform":
        prompt = source && routed.target
          ? buildTransformPrompt(ctx, routed.target, source)
          : buildContentPrompt(ctx, routed.asset ?? "x_post", question);
        break;
      case "analysis":
        prompt = buildAnalysisPrompt(ctx, question, recentTurns);
        break;
      case "campaign":
        // Campaign planning lives in the Missions workspace; nudge there rather than
        // improvising a plan in chat, but still answer strategically.
        prompt = buildStrategyPrompt(ctx, question, recentTurns);
        break;
      case "strategy":
      default:
        prompt = buildStrategyPrompt(ctx, question, recentTurns);
    }

    // Content-family intents render as bare deliverables (no reasoning shown);
    // strategy/analysis render the reasoning.
    const reasoning = routed.intent === "strategy" || routed.intent === "analysis" || routed.intent === "campaign";
    const confidence = confidenceOf(ctx.signals);
    console.info(JSON.stringify({ event: "cmo_ask", wsKey: key, intent: routed.intent, asset: routed.asset, confidence }));
    return NextResponse.json({
      ok: true, prompt, intent: routed.intent, asset: routed.asset, reasoning, confidence,
      nudge: routed.intent === "campaign" ? "/app/campaigns" : null,
    });
  } catch (e) {
    console.info(JSON.stringify({ event: "cmo_ask_error", detail: String(e).slice(0, 200) }));
    return NextResponse.json({ error: "assemble_failed" }, { status: 502 });
  }
}
