import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureGoogleTable, disconnect } from "@/lib/google";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();
  const sql = db();
  if (!session || !sql) return NextResponse.json({ ok: false });
  await ensureGoogleTable(sql);
  await disconnect(sql, session.userId);
  return NextResponse.json({ ok: true });
}
