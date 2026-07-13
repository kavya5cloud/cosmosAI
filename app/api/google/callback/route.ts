import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { exchangeCode, ensureGoogleTable, saveTokens } from "@/lib/google";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const session = await getSession();
  const sql = db();
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  const c = await cookies();
  const expectedState = c.get("gsc_state")?.value;
  c.delete("gsc_state");

  if (!session || !sql) return NextResponse.redirect(origin + "/app?gsc=login");
  if (!code || !state || state !== expectedState) return NextResponse.redirect(origin + "/app?gsc=denied");

  try {
    const tok = await exchangeCode(code, origin);
    if (!tok.access_token) return NextResponse.redirect(origin + "/app?gsc=error");
    await ensureGoogleTable(sql);
    await saveTokens(sql, session.userId, tok);
    return NextResponse.redirect(origin + "/app?gsc=connected");
  } catch {
    return NextResponse.redirect(origin + "/app?gsc=error");
  }
}
