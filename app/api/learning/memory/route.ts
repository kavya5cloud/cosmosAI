import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { learningEngine } from "@/lib/learning/shared";
import { MEMORY_KINDS, type MemoryKind } from "@/lib/creative-intelligence/types";
import type { CreativeChannel } from "@/lib/creative/taxonomy";

export const runtime = "nodejs";

// Creative Memory — the learned store of winning / underperforming assets (reuses the
// Milestone 8 creative memory, now auto-updated by the Learning Engine). Searchable.
export async function GET(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 60 : 20, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const p = req.nextUrl.searchParams;
  const kind = p.get("kind");
  const results = await learningEngine(db()).memory.search({
    kind: kind && (MEMORY_KINDS as readonly string[]).includes(kind) ? (kind as MemoryKind) : undefined,
    channel: (p.get("channel") as CreativeChannel) || undefined,
    text: p.get("q") || undefined,
    audience: p.get("audience") || undefined,
  }, Math.min(50, Number(p.get("limit")) || 20));
  return NextResponse.json({ ok: true, results });
}
