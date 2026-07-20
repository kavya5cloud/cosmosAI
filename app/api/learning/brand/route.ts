import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { workspaceKey } from "@/lib/intel";
import { learningEngine } from "@/lib/learning/shared";

export const runtime = "nodejs";

// Brand DNA — the current learned brand identity plus its version history. Never
// overwritten; always versioned.
export async function GET(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 60 : 20, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const key = (await workspaceKey(req.nextUrl.searchParams.get("wsid"))) ?? "default";
  const engine = learningEngine(db());
  const current = await engine.brand.latest(key);
  const versions = await engine.brand.versions(key);
  return NextResponse.json({ ok: true, brand: current, versionCount: versions.length });
}
