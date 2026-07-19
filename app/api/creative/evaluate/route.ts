import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { workspaceKey } from "@/lib/intel";
import { getCampaign } from "@/lib/services/campaigns";
import { runCouncil } from "@/lib/creative/council";
import {
  campaignToPlannerInput,
  evaluationContext,
  normalizeBrief,
  normalizePlannerInput,
  normalizeSubject,
  knownFactsFromBrief,
} from "@/lib/creative/pipeline";
import type { EvaluationContext } from "@/lib/creative/types";

export const runtime = "nodejs";

// Creative evaluation API — deterministic, no generation. Runs the Creative Director
// evaluators + the Approval Council over a candidate asset and returns the verdict
// (APPROVED / REVISION_REQUIRED / REJECTED) with the full evidence trail.
//
// Context resolution mirrors the plan API: a campaignId pulls the real brief from the
// existing pipeline; otherwise an inline brief/campaign is accepted.
export async function POST(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 40 : 15, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_request" }, { status: 400 }); }

  const subject = normalizeSubject(body.subject ?? body);
  if (!subject) return NextResponse.json({ error: "invalid_subject", hint: "provide subject.kind and subject.body" }, { status: 422 });

  try {
    let ctx: EvaluationContext | null = null;

    const campaignId = String(body.campaignId || "");
    if (/^[0-9a-f-]{36}$/i.test(campaignId)) {
      const sql = db();
      if (!sql) return NextResponse.json({ error: "no_database" }, { status: 503 });
      const key = await workspaceKey((body.wsid as string) ?? null);
      if (!key) return NextResponse.json({ error: "no_key" }, { status: 400 });
      const row = await getCampaign(sql, key, campaignId);
      if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
      ctx = evaluationContext(campaignToPlannerInput(row, body.mission as string | undefined));
    } else {
      // Inline context: from an explicit planner input, or at minimum a brief.
      const input = normalizePlannerInput(body);
      if (input) {
        ctx = evaluationContext(input);
      } else if (body.brief) {
        const brief = normalizeBrief(body.brief as Record<string, unknown>);
        ctx = { brief, knownFacts: knownFactsFromBrief(brief) };
      }
    }
    if (!ctx) return NextResponse.json({ error: "no_context", hint: "provide campaignId, a campaign, or a brief" }, { status: 422 });

    const decision = runCouncil(subject, ctx);
    console.info(JSON.stringify({
      event: "creative_evaluate_api", kind: subject.kind, verdict: decision.verdict,
      score: decision.score, blocking: decision.blockingIssues.length,
    }));
    return NextResponse.json({ ok: true, decision });
  } catch (e) {
    console.info(JSON.stringify({ event: "creative_evaluate_error", detail: String(e).slice(0, 200) }));
    return NextResponse.json({ error: "evaluate_failed" }, { status: 502 });
  }
}
