import { NextRequest, NextResponse } from "next/server";
import { jobEngine } from "@/lib/jobs/shared";
import { TERMINAL_STATES } from "@/lib/jobs/types";

export const runtime = "nodejs";

// Real-time job progress. Server-Sent Events by default (frontend subscribes to real
// execution, never simulated). Pass ?poll=1 for a plain JSON snapshot of the event log
// (the polling-abstraction fallback).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const engine = jobEngine();
  if (!engine.getJob(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (req.nextUrl.searchParams.get("poll")) {
    return NextResponse.json({ ok: true, events: engine.events(id) });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      // Replay past events so a late subscriber catches up.
      for (const e of engine.events(id)) send(e);

      const done = () => {
        const job = engine.getJob(id);
        if (job && TERMINAL_STATES.includes(job.state)) { clearInterval(iv); unsub(); try { controller.close(); } catch { /* closed */ } }
      };
      const unsub = engine.bus.subscribeJob(id, (e) => { send(e); done(); });
      // Safety: also poll for terminal state + heartbeat, and cap the stream lifetime.
      const iv = setInterval(() => { send({ type: "heartbeat", at: Date.now() }); done(); }, 5000);
      const cap = setTimeout(() => { clearInterval(iv); unsub(); try { controller.close(); } catch { /* closed */ } }, 120000);
      done();
      req.signal.addEventListener("abort", () => { clearInterval(iv); clearTimeout(cap); unsub(); try { controller.close(); } catch { /* closed */ } });
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
