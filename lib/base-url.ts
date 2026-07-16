import type { NextRequest } from "next/server";

/**
 * Canonical public base URL for building OAuth redirect URIs.
 * Priority:
 *   1. APP_URL / NEXT_PUBLIC_APP_URL env (set this on Vercel to your primary domain,
 *      e.g. https://www.trypopulr.in) — deterministic, always matches what you register.
 *   2. x-forwarded-host + x-forwarded-proto headers (the real public host on Vercel).
 *   3. req.nextUrl.origin (fallback / local dev).
 * No trailing slash.
 */
export function baseUrl(req: NextRequest): string {
  const explicit = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  return (host ? `${proto}://${host}` : req.nextUrl.origin).replace(/\/$/, "");
}
