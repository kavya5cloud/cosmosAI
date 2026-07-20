import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { workspaceKey } from "@/lib/intel";
import { normalizePerformanceEvent } from "@/lib/learning";
import { learningEngine } from "@/lib/learning/shared";
import { PLATFORMS, type PlatformId } from "@/lib/publishing/types";

export const runtime = "nodejs";

// Performance ingestion — accept raw performance events from any platform, normalize into
// the unified schema, and feed the Learning Engine (updates patterns, brand DNA, creative
// memory and business-graph signals). Deterministic; no LLM.
export async function POST(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 40 : 15, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_request" }, { status: 400 }); }

  const raw = Array.isArray(body.events) ? body.events : [];
  if (!raw.length) return NextResponse.json({ error: "no_events" }, { status: 422 });

  const events = raw
    .map((e) => {
      const o = (e ?? {}) as Record<string, unknown>;
      const platform = String(o.platform || "") as PlatformId;
      if (!o.assetKey || !(PLATFORMS as readonly string[]).includes(platform)) return null;
      return normalizePerformanceEvent({
        id: o.id as string | undefined, assetKey: String(o.assetKey), platform,
        kind: o.kind as never, campaignId: (o.campaignId as string) ?? null, missionId: (o.missionId as string) ?? null,
        industry: (o.industry as string) ?? null, audience: (o.audience as string) ?? null,
        at: typeof o.at === "number" ? o.at : Date.now(),
        metrics: (o.metrics as Record<string, number>) ?? {},
      });
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  if (!events.length) return NextResponse.json({ error: "invalid_events", hint: "each event needs assetKey + valid platform" }, { status: 422 });

  const key = (await workspaceKey((body.wsid as string) ?? null)) ?? "default";
  const result = await learningEngine(db()).ingest(events, { workspaceKey: key });
  console.info(JSON.stringify({ event: "learning_ingest", events: events.length, patterns: result.patterns.length, brandVersion: result.brandVersion }));
  return NextResponse.json({ ok: true, result });
}
