import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, requestKey } from "@/lib/throttle";
import { workspaceKey } from "@/lib/intel";
import { NeonMediaRepo } from "@/lib/content/media";
import type { MediaType } from "@/lib/content/types";

export const runtime = "nodejs";

// Media Library — searchable store of every produced/uploaded asset. GET searches;
// POST registers an uploaded asset (logo, font, brand asset, character, template…).
const MEDIA_TYPES: MediaType[] = ["image", "video", "audio", "template", "character", "logo", "font", "brand_asset", "motion_asset"];

export async function GET(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 60 : 20, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const sql = db();
  if (!sql) return NextResponse.json({ enabled: false, media: [] });
  const key = await workspaceKey(req.nextUrl.searchParams.get("wsid"));
  if (!key) return NextResponse.json({ error: "no_key" }, { status: 400 });

  const p = req.nextUrl.searchParams;
  const mediaType = p.get("type");
  try {
    const media = await new NeonMediaRepo(sql).search({
      workspaceKey: key,
      mediaType: mediaType && MEDIA_TYPES.includes(mediaType as MediaType) ? (mediaType as MediaType) : undefined,
      q: p.get("q") ?? undefined,
      tag: p.get("tag") ?? undefined,
      limit: Math.min(200, Number(p.get("limit")) || 100),
    });
    return NextResponse.json({ enabled: true, count: media.length, media });
  } catch (e) {
    return NextResponse.json({ enabled: false, media: [], error: String(e).slice(0, 150) }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 30 : 8, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const sql = db();
  if (!sql) return NextResponse.json({ error: "no_database" }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_request" }, { status: 400 }); }
  const key = await workspaceKey((body.wsid as string) ?? null);
  if (!key) return NextResponse.json({ error: "no_key" }, { status: 400 });

  const mediaType = String(body.mediaType || "");
  const uri = String(body.uri || "");
  if (!MEDIA_TYPES.includes(mediaType as MediaType) || !uri) {
    return NextResponse.json({ error: "invalid", hint: "mediaType and uri are required" }, { status: 422 });
  }

  try {
    const item = await new NeonMediaRepo(sql).put({
      workspaceKey: key, mediaType: mediaType as MediaType, uri,
      mime: String(body.mime || "application/octet-stream"),
      title: String(body.title || ""),
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      kind: null, providerId: null, assetRootId: typeof body.assetRootId === "string" ? body.assetRootId : null,
      bytes: null, width: null, height: null, durationMs: null,
      meta: (body.meta && typeof body.meta === "object" ? body.meta : null) as Record<string, unknown> | null,
    });
    return NextResponse.json({ ok: true, media: item });
  } catch (e) {
    return NextResponse.json({ error: "save_failed", detail: String(e).slice(0, 150) }, { status: 502 });
  }
}
