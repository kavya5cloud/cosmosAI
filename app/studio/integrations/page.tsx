"use client";
import { useEffect, useRef, useState } from "react";

// Studio → Integrations (Part 9) — the connector cockpit. Lists every connector with its
// connection + health + sync status, the latest Business Events flowing onto the bus, and
// sync history. Connect / Sync are live (POST /api/connectors/*). Everything real.

type Cap = { id: string; label: string; category: string; oauth: boolean; webhooks: boolean; rateLimitPerMin: number; version: string };
type Status = { id: string; state: string; lastSyncAt: number | null; eventsProduced: number; errors: number };
type ConnectorRow = { capabilities: Cap; status: Status };
type BizEvent = { id: string; connector: string; type: string; entity: string; normalizedPayload: { kind: string } };
type SyncRun = { id: string; connector: string; mode: string; durationMs: number | null; recordsProcessed: number; eventsPublished: number; errors: number; ok: boolean };

const STATE_CLASS: Record<string, string> = { connected: "job-ok", error: "job-bad", connecting: "job-warn", disconnected: "job-muted" };

export default function IntegrationsDashboard() {
  const [rows, setRows] = useState<ConnectorRow[]>([]);
  const [events, setEvents] = useState<BizEvent[]>([]);
  const [history, setHistory] = useState<SyncRun[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const seeded = useRef(false);

  async function refresh() {
    const [c, e, h] = await Promise.all([
      fetch("/api/connectors", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/connectors/events?limit=12", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/connectors/history", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ]);
    if (c.connectors) setRows(c.connectors);
    if (e.events) setEvents(e.events);
    if (h.history) setHistory(h.history);
  }

  useEffect(() => {
    (async () => {
      await refresh();
      if (!seeded.current) {
        seeded.current = true;
        // Connect a few connectors + sync so the cockpit shows live activity on first load.
        for (const id of ["google_analytics", "stripe", "meta_ads", "linkedin"]) {
          await fetch("/api/connectors/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connector: id }) }).catch(() => {});
        }
        await fetch("/api/connectors/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "incremental" }) }).catch(() => {});
        await refresh();
      }
    })();
    const iv = setInterval(refresh, 3000);
    return () => clearInterval(iv);
  }, []);

  async function connect(id: string, connected: boolean) {
    setBusy(id);
    await fetch(`/api/connectors/${connected ? "disconnect" : "connect"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connector: id }) }).catch(() => {});
    if (!connected) await fetch("/api/connectors/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connector: id }) }).catch(() => {});
    await refresh(); setBusy(null);
  }

  const connected = rows.filter((r) => r.status.state === "connected");

  return (
    <section className="st-section lw">
      <header className="st-shead">
        <span className="label">Execution · Integrations</span>
        <h1>Connectors</h1>
        <p>Collect business signals from external systems and turn them into normalized Business Events — the fuel for the Business Graph, Learning Engine and Decision Planner. Connectors never touch business objects; everything flows through events.</p>
      </header>

      <div className="job-tiles">
        <div className="job-tile"><div className="job-tile-v">{connected.length}/{rows.length}</div><div className="job-tile-k">Connected</div></div>
        <div className="job-tile"><div className="job-tile-v">{events.length ? "live" : "—"}</div><div className="job-tile-k">Event stream</div></div>
        <div className="job-tile"><div className="job-tile-v">{history.length}</div><div className="job-tile-k">Sync runs</div></div>
        <div className="job-tile"><div className="job-tile-v">{rows.reduce((s, r) => s + r.status.eventsProduced, 0)}</div><div className="job-tile-k">Events produced</div></div>
      </div>

      <section className="lw-block">
        <h2 className="lw-h2">Connected Services</h2>
        <div className="st-grid">
          {rows.map((r) => {
            const on = r.status.state === "connected";
            return (
              <div key={r.capabilities.id} className="lw-card">
                <div className="lw-card-h">{r.capabilities.label}</div>
                <div className="lw-meta">{r.capabilities.category} · {r.capabilities.rateLimitPerMin}/min{r.capabilities.webhooks ? " · webhooks" : ""}</div>
                <div className="lw-meta"><span className={"job-state " + (STATE_CLASS[r.status.state] ?? "")}>{r.status.state}</span>{r.status.eventsProduced ? ` · ${r.status.eventsProduced} events` : ""}</div>
                <button className="st-card-cta st-card-gen" disabled={busy === r.capabilities.id} onClick={() => connect(r.capabilities.id, on)}>{on ? "Disconnect" : "Connect"}</button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="lw-block">
        <h2 className="lw-h2">Latest Business Events</h2>
        <div className="job-list">
          {events.length ? events.map((e) => (
            <div key={e.id} className="job-row">
              <span className="job-type">{e.type.replace(/([A-Z])/g, " $1").trim()}</span>
              <span className="job-state job-ok">{e.normalizedPayload.kind}</span>
              <span className="lw-muted">{e.connector} · {e.entity}</span>
              <span className="job-meta">normalized</span>
            </div>
          )) : <div className="lw-muted">No events yet — connect a service.</div>}
        </div>
      </section>

      <section className="lw-block">
        <h2 className="lw-h2">Sync History</h2>
        <div className="job-list">
          {history.slice(0, 10).map((h) => (
            <div key={h.id} className="job-row">
              <span className="job-type">{h.connector.replace(/_/g, " ")}</span>
              <span className={"job-state " + (h.ok ? "job-ok" : "job-bad")}>{h.ok ? "ok" : "error"}</span>
              <span className="lw-muted">{h.mode} · {h.recordsProcessed} records · {h.eventsPublished} events</span>
              <span className="job-meta">{h.durationMs != null ? `${h.durationMs}ms` : ""}{h.errors ? ` · ${h.errors} err` : ""}</span>
            </div>
          ))}
          {history.length === 0 && <div className="lw-muted">No syncs yet.</div>}
        </div>
      </section>
    </section>
  );
}
