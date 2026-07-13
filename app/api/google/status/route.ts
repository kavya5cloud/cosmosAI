import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { googleConfigured, ensureGoogleTable, getAccessToken, listSites } from "@/lib/google";

export const runtime = "nodejs";

export async function GET() {
  const configured = googleConfigured();
  const session = await getSession();
  const sql = db();
  if (!configured || !session || !sql) {
    return NextResponse.json({ configured, connected: false, sites: [] });
  }
  try {
    await ensureGoogleTable(sql);
    const token = await getAccessToken(sql, session.userId);
    if (!token) return NextResponse.json({ configured, connected: false, sites: [] });
    const sites = await listSites(token);
    return NextResponse.json({ configured, connected: true, sites });
  } catch {
    return NextResponse.json({ configured, connected: false, sites: [] });
  }
}
