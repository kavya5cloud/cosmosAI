import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { workspaceKey } from "@/lib/intel";
import { NeonHistoryRepo } from "@/lib/content/history";

export const runtime = "nodejs";

// Generation history — the immutable record of every generation for a workspace.
export async function GET(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 60 : 20, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const sql = db();
  if (!sql) return NextResponse.json({ enabled: false, history: [] });
  const key = await workspaceKey(req.nextUrl.searchParams.get("wsid"));
  if (!key) return NextResponse.json({ error: "no_key" }, { status: 400 });

  const p = req.nextUrl.searchParams;
  try {
    const history = await new NeonHistoryRepo(sql).list({
      workspaceKey: key,
      modality: p.get("modality") ?? undefined,
      kind: p.get("kind") ?? undefined,
      providerId: p.get("providerId") ?? undefined,
      assetRootId: p.get("assetRootId") ?? undefined,
      limit: Math.min(200, Number(p.get("limit")) || 100),
    });
    return NextResponse.json({ enabled: true, count: history.length, history });
  } catch (e) {
    return NextResponse.json({ enabled: false, history: [], error: String(e).slice(0, 150) }, { status: 502 });
  }
}
