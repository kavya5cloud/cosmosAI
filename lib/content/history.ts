import { type Sql, RUNTIME_DDL } from "@/lib/db";
import type { HistoryEntry } from "@/lib/content/types";

// Generation History — the immutable record of every generation. Repository pattern:
// callers depend on the interface, so the store swaps (in-memory for tests/dev, Neon
// for production) without touching pipelines or routes. History is never mutated except
// to attach an approval/performance outcome to an existing row.

export type HistoryInput = Omit<HistoryEntry, "id" | "createdAt">;

export type HistoryFilter = {
  workspaceKey: string;
  modality?: string;
  kind?: string;
  providerId?: string;
  assetRootId?: string;
  limit?: number;
};

export interface GenerationHistoryRepo {
  record(entry: HistoryInput): Promise<HistoryEntry>;
  list(filter: HistoryFilter): Promise<HistoryEntry[]>;
  get(id: string): Promise<HistoryEntry | null>;
  attachOutcome(id: string, outcome: { approval?: HistoryEntry["approval"]; councilScore?: number; performance?: Record<string, unknown> }): Promise<boolean>;
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `hist_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/** In-memory history — deterministic and dependency-free (default for tests/dev). */
export class InMemoryHistoryRepo implements GenerationHistoryRepo {
  private rows: HistoryEntry[] = [];

  async record(entry: HistoryInput): Promise<HistoryEntry> {
    const row: HistoryEntry = { id: newId(), createdAt: new Date().toISOString(), ...entry };
    this.rows.unshift(row);
    return row;
  }
  async list(filter: HistoryFilter): Promise<HistoryEntry[]> {
    let out = this.rows.filter((r) => r.workspaceKey === filter.workspaceKey);
    if (filter.modality) out = out.filter((r) => r.modality === filter.modality);
    if (filter.kind) out = out.filter((r) => r.kind === filter.kind);
    if (filter.providerId) out = out.filter((r) => r.providerId === filter.providerId);
    if (filter.assetRootId) out = out.filter((r) => r.assetRootId === filter.assetRootId);
    return out.slice(0, filter.limit ?? 100);
  }
  async get(id: string): Promise<HistoryEntry | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async attachOutcome(id: string, outcome: { approval?: HistoryEntry["approval"]; councilScore?: number; performance?: Record<string, unknown> }): Promise<boolean> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return false;
    if (outcome.approval) row.approval = outcome.approval;
    if (outcome.councilScore != null) row.councilScore = outcome.councilScore;
    if (outcome.performance) row.performance = outcome.performance;
    return true;
  }
}

let historyReady = false;
async function ensureHistoryTable(sql: Sql) {
  if (historyReady) return;
  if (!RUNTIME_DDL) { historyReady = true; return; }
  await sql`CREATE TABLE IF NOT EXISTS generation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    workspace_key TEXT NOT NULL,
    modality TEXT NOT NULL, kind TEXT NOT NULL,
    provider_id TEXT NOT NULL, provider_version TEXT NOT NULL,
    cost REAL NOT NULL DEFAULT 0, latency_ms INTEGER NOT NULL DEFAULT 0,
    prompt_hash TEXT NOT NULL, cached BOOLEAN NOT NULL DEFAULT false,
    brief JSONB, mission TEXT, campaign_id UUID, asset_root_id UUID,
    approval TEXT NOT NULL DEFAULT 'PENDING', council_score REAL, performance JSONB
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_genevents_ws ON generation_events (workspace_key, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_genevents_hash ON generation_events (prompt_hash)`;
  historyReady = true;
}

type Row = {
  id: string; created_at: string; workspace_key: string; modality: string; kind: string;
  provider_id: string; provider_version: string; cost: number; latency_ms: number;
  prompt_hash: string; cached: boolean; brief: unknown; mission: string | null;
  campaign_id: string | null; asset_root_id: string | null; approval: string;
  council_score: number | null; performance: unknown;
};

function toEntry(r: Row): HistoryEntry {
  return {
    id: r.id, createdAt: r.created_at, workspaceKey: r.workspace_key,
    modality: r.modality as HistoryEntry["modality"], kind: r.kind as HistoryEntry["kind"],
    providerId: r.provider_id, providerVersion: r.provider_version, cost: r.cost,
    latencyMs: r.latency_ms, promptHash: r.prompt_hash, cached: r.cached,
    brief: (r.brief as HistoryEntry["brief"]) ?? null, mission: r.mission, campaignId: r.campaign_id,
    assetRootId: r.asset_root_id, approval: r.approval as HistoryEntry["approval"],
    councilScore: r.council_score, performance: (r.performance as Record<string, unknown>) ?? null,
  };
}

/** Neon-backed history for production. */
export class NeonHistoryRepo implements GenerationHistoryRepo {
  constructor(private sql: Sql) {}

  async record(e: HistoryInput): Promise<HistoryEntry> {
    await ensureHistoryTable(this.sql);
    const rows = (await this.sql`
      INSERT INTO generation_events
        (workspace_key, modality, kind, provider_id, provider_version, cost, latency_ms,
         prompt_hash, cached, brief, mission, campaign_id, asset_root_id, approval, council_score, performance)
      VALUES
        (${e.workspaceKey}, ${e.modality}, ${e.kind}, ${e.providerId}, ${e.providerVersion}, ${e.cost}, ${e.latencyMs},
         ${e.promptHash}, ${e.cached}, ${e.brief ? JSON.stringify(e.brief) : null}::jsonb, ${e.mission},
         ${e.campaignId}, ${e.assetRootId}, ${e.approval}, ${e.councilScore},
         ${e.performance ? JSON.stringify(e.performance) : null}::jsonb)
      RETURNING *`) as Row[];
    return toEntry(rows[0]);
  }

  async list(f: HistoryFilter): Promise<HistoryEntry[]> {
    await ensureHistoryTable(this.sql);
    const rows = (await this.sql`
      SELECT * FROM generation_events
      WHERE workspace_key = ${f.workspaceKey}
        AND (${f.modality ?? null}::text IS NULL OR modality = ${f.modality ?? null})
        AND (${f.kind ?? null}::text IS NULL OR kind = ${f.kind ?? null})
        AND (${f.providerId ?? null}::text IS NULL OR provider_id = ${f.providerId ?? null})
        AND (${f.assetRootId ?? null}::uuid IS NULL OR asset_root_id = ${f.assetRootId ?? null}::uuid)
      ORDER BY created_at DESC
      LIMIT ${f.limit ?? 100}`) as Row[];
    return rows.map(toEntry);
  }

  async get(id: string): Promise<HistoryEntry | null> {
    await ensureHistoryTable(this.sql);
    const rows = (await this.sql`SELECT * FROM generation_events WHERE id = ${id}`) as Row[];
    return rows[0] ? toEntry(rows[0]) : null;
  }

  async attachOutcome(id: string, o: { approval?: HistoryEntry["approval"]; councilScore?: number; performance?: Record<string, unknown> }): Promise<boolean> {
    await ensureHistoryTable(this.sql);
    const rows = (await this.sql`
      UPDATE generation_events SET
        approval = COALESCE(${o.approval ?? null}, approval),
        council_score = COALESCE(${o.councilScore ?? null}, council_score),
        performance = COALESCE(${o.performance ? JSON.stringify(o.performance) : null}::jsonb, performance)
      WHERE id = ${id} RETURNING id`) as { id: string }[];
    return rows.length > 0;
  }
}
