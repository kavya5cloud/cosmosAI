import { type Sql, RUNTIME_DDL } from "@/lib/db";
import type { AssetAggregate, BusinessGraphSignal } from "./types";
import { clamp01, idFrom, round } from "./util";

// Business Graph Evolution (Part 6) — the Learning Engine emits versioned SIGNALS that
// enrich the Business Graph (channel performance, audience response, campaign history,
// relationships) without mutating the canonical projection in lib/business-graph.ts.
// Deterministic; every signal is versioned.

/** Derive business-graph signals from aggregated performance. */
export function evolveBusinessGraph(workspaceKey: string, aggregates: AssetAggregate[]): BusinessGraphSignal[] {
  const signals: BusinessGraphSignal[] = [];

  // Channel/platform performance: mean score per platform.
  const byPlatform = new Map<string, number[]>();
  const byAudience = new Map<string, number[]>();
  const byCampaign = new Map<string, number[]>();
  for (const a of aggregates) {
    (byPlatform.get(a.platform) ?? byPlatform.set(a.platform, []).get(a.platform)!).push(a.score);
    if (a.audience) (byAudience.get(a.audience) ?? byAudience.set(a.audience, []).get(a.audience)!).push(a.score);
    if (a.campaignId) (byCampaign.get(a.campaignId) ?? byCampaign.set(a.campaignId, []).get(a.campaignId)!).push(a.score);
  }

  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
  const sig = (kind: BusinessGraphSignal["kind"], key: string, value: string, perf: number, evidence: number): BusinessGraphSignal => ({
    id: idFrom("bgsig", workspaceKey, kind, key),
    workspaceKey, kind, key, value,
    performance: round(clamp01(perf)),
    confidence: round(clamp01(perf * 0.6 + Math.min(1, evidence / 5) * 0.4)),
    version: 1, at: 0,
  });

  for (const [p, xs] of byPlatform) signals.push(sig("channel", p, `${p} performs at ${round(mean(xs))}`, mean(xs), xs.length));
  for (const [aud, xs] of byAudience) signals.push(sig("audience", aud, `${aud} responds at ${round(mean(xs))}`, mean(xs), xs.length));
  for (const [c, xs] of byCampaign) signals.push(sig("campaign_history", c, `campaign ${c} scored ${round(mean(xs))}`, mean(xs), xs.length));
  for (const [p, xs] of byPlatform) signals.push(sig("performance", `overall_${p}`, `overall ${p}`, mean(xs), xs.length));

  return signals.sort((a, b) => b.performance - a.performance || a.id.localeCompare(b.id));
}

// ---- Repository (versioned; in-memory + Neon) ----

export interface BgSignalStore {
  record(s: BusinessGraphSignal): Promise<BusinessGraphSignal>;
  list(workspaceKey: string): Promise<BusinessGraphSignal[]>;
}

export class InMemoryBgSignalStore implements BgSignalStore {
  private map = new Map<string, BusinessGraphSignal>();
  async record(s: BusinessGraphSignal) {
    const prev = this.map.get(s.id);
    const next = prev
      ? { ...s, performance: round((prev.performance * prev.version + s.performance) / (prev.version + 1)), version: prev.version + 1 }
      : s;
    this.map.set(s.id, next);
    return next;
  }
  async list(workspaceKey: string) {
    return [...this.map.values()].filter((s) => s.workspaceKey === workspaceKey).sort((a, b) => b.performance - a.performance);
  }
}

let bgReady = false;
async function ensureBgTable(sql: Sql) {
  if (bgReady) return;
  if (!RUNTIME_DDL) { bgReady = true; return; }
  await sql`CREATE TABLE IF NOT EXISTS learn_bg_signals (
    id TEXT PRIMARY KEY,
    workspace_key TEXT NOT NULL,
    kind TEXT NOT NULL,
    key TEXT NOT NULL,
    performance REAL NOT NULL DEFAULT 0,
    confidence REAL NOT NULL DEFAULT 0,
    version INT NOT NULL DEFAULT 1,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_learn_bg_ws ON learn_bg_signals (workspace_key, performance DESC)`;
  bgReady = true;
}

export class NeonBgSignalStore implements BgSignalStore {
  constructor(private sql: Sql) {}
  async record(s: BusinessGraphSignal) {
    await ensureBgTable(this.sql);
    const rows = (await this.sql`
      INSERT INTO learn_bg_signals (id, workspace_key, kind, key, performance, confidence, version, data)
      VALUES (${s.id}, ${s.workspaceKey}, ${s.kind}, ${s.key}, ${s.performance}, ${s.confidence}, ${s.version}, ${JSON.stringify(s)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        version = learn_bg_signals.version + 1,
        performance = (learn_bg_signals.performance * learn_bg_signals.version + EXCLUDED.performance) / (learn_bg_signals.version + 1),
        data = EXCLUDED.data, updated_at = now()
      RETURNING data`) as { data: BusinessGraphSignal }[];
    return rows[0]?.data ?? s;
  }
  async list(workspaceKey: string) {
    await ensureBgTable(this.sql);
    const rows = (await this.sql`SELECT data FROM learn_bg_signals WHERE workspace_key = ${workspaceKey} ORDER BY performance DESC LIMIT 500`) as { data: BusinessGraphSignal }[];
    return rows.map((r) => r.data);
  }
}
