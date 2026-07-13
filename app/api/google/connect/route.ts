import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { googleConfigured, authUrl } from "@/lib/google";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getSession();
  const origin = req.nextUrl.origin;
  if (!session) return NextResponse.redirect(origin + "/app?gsc=login");
  if (!googleConfigured()) return NextResponse.redirect(origin + "/app?gsc=notconfigured");

  const state = crypto.randomUUID();
  const c = await cookies();
  c.set("gsc_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  return NextResponse.redirect(authUrl(origin, state));
}
