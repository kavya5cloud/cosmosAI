import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTrialActive } from "@/lib/trial";
import { isSafePublicUrl, rateLimit, requestKey } from "@/lib/throttle";
import { generateText } from "@/lib/services/llm";

export const runtime = "nodejs";

// Thin HTTP wrapper over the server-side LLM service (lib/services/llm.ts).
// Owns only request concerns: auth, rate limiting, trial gate, input validation.
// All generation logic (provider fallback, caching, URL context, dedup) lives in the
// service, which server code can also call directly without a round-trip.
export async function POST(req: NextRequest) {
  const session = await getSession();
  const limit = rateLimit(requestKey(req.headers, session?.userId), session ? 20 : 8, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", hint: "slow down and try again" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let payload: { prompt?: string; url?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Enforce the free trial server-side: a signed-in account past its trial is blocked
  // (anonymous/no-DB usage stays open as a demo).
  if (session && !(await isTrialActive(session.userId))) {
    return NextResponse.json({ error: "trial_ended", hint: "your free month has ended — upgrade to continue" }, { status: 402 });
  }

  const rawPrompt = (payload.prompt || "").trim();
  if (rawPrompt.length > 10_000) return NextResponse.json({ error: "prompt_too_large" }, { status: 413 });
  if (!rawPrompt) return NextResponse.json({ error: "empty_prompt" }, { status: 400 });
  if (payload.url && !isSafePublicUrl(payload.url)) {
    return NextResponse.json({ error: "unsafe_url", hint: "use a public http(s) website URL" }, { status: 400 });
  }

  const result = await generateText({ prompt: rawPrompt, url: payload.url || null });
  if (result.ok) {
    return NextResponse.json({
      text: result.text,
      provider: result.provider,
      cached: result.cached,
      ...(result.stale ? { stale: true } : {}),
      ...(result.coalesced ? { coalesced: true } : {}),
    });
  }
  return NextResponse.json(
    {
      error: result.error,
      ...(result.message ? { message: result.message } : {}),
      ...(result.error === "no_api_key" ? { hint: "set GROQ_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY in .env.local" } : {}),
    },
    { status: result.status }
  );
}
