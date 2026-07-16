import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

function configured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  if (!configured()) return NextResponse.redirect(origin + "/app?auth=unavailable");

  const state = crypto.randomUUID();
  const c = await cookies();
  c.set("oauth_login_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: origin + "/api/auth/google/callback",
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return NextResponse.redirect("https://accounts.google.com/o/oauth2/v2/auth?" + p.toString());
}
