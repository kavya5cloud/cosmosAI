import { type Sql, RUNTIME_DDL } from "@/lib/db";
import type { BusinessEvent, ConnectorId, ConnectorStatus, SyncRun } from "./types";

// Persistence — business events (append-only), connector status snapshots and sync
// history. Repository pattern: in-memory (default/tests) + Neon (durable). Never loses
// history.

export interface ConnectorStore {
  appendEvent(e: BusinessEvent): Promise<void>;
  listEvents(tenant?: string, limit?: number): Promise<BusinessEvent[]>;
  saveStatus(s: ConnectorStatus): Promise<void>;
  listStatus(): Promise<ConnectorStatus[]>;
  appendSync(r: SyncRun): Promise<void>;
  listSyncs(limit?: number): Promise<SyncRun[]>;
}

export class InMemoryConnectorStore implements ConnectorStore {
  private events: BusinessEvent[] = [];
  private status = new Map<ConnectorId, ConnectorStatus>();
  private syncs: SyncRun[] = [];
  async appendEvent(e: BusinessEvent) { this.events.push(e); }
  async listEvents(tenant?: string, limit = 200) {
    const es = tenant ? this.events.filter((e) => e.tenant === tenant) : this.events;
    return es.slice(-limit).reverse();
  }
  async saveStatus(s: ConnectorStatus) { this.status.set(s.id, s); }
  async listStatus() { return [...this.status.values()]; }
  async appendSync(r: SyncRun) { this.syncs.push(r); }
  async listSyncs(limit = 100) { return [...this.syncs].sort((a, b) => b.startedAt - a.startedAt).slice(0, limit); }
}

let ready = false;
async function ensureTables(sql: Sql) {
  if (ready) return;
  if (!RUNTIME_DDL) { ready = true; return; }
  await sql`CREATE TABLE IF NOT EXISTS business_events (
    id TEXT PRIMARY KEY,
    tenant TEXT NOT NULL,
    connector TEXT NOT NULL,
    type TEXT NOT NULL,
    entity TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0,
    version INT NOT NULL DEFAULT 1,
    timestamp BIGINT NOT NULL,
    data JSONB NOT NULL
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_be_tenant ON business_events (tenant, timestamp DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_be_connector ON business_events (connector, timestamp DESC)`;
  await sql`CREATE TABLE IF NOT EXISTS connectors (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    version TEXT,
    last_sync_at BIGINT,
    next_sync_at BIGINT,
    events_produced INT NOT NULL DEFAULT 0,
    errors INT NOT NULL DEFAULT 0,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS sync_history (
    id TEXT PRIMARY KEY,
    connector TEXT NOT NULL,
    tenant TEXT NOT NULL,
    mode TEXT NOT NULL,
    started_at BIGINT NOT NULL,
    duration_ms INT,
    records_processed INT NOT NULL DEFAULT 0,
    events_published INT NOT NULL DEFAULT 0,
    errors INT NOT NULL DEFAULT 0,
    ok BOOLEAN NOT NULL DEFAULT false
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sync_connector ON sync_history (connector, started_at DESC)`;
  ready = true;
}

export class NeonConnectorStore implements ConnectorStore {
  constructor(private sql: Sql) {}
  async appendEvent(e: BusinessEvent) {
    await ensureTables(this.sql);
    await this.sql`INSERT INTO business_events (id, tenant, connector, type, entity, confidence, version, timestamp, data)
      VALUES (${e.id}, ${e.tenant}, ${e.connector}, ${e.type}, ${e.entity}, ${e.confidence}, ${e.version}, ${e.timestamp}, ${JSON.stringify(e)}::jsonb)
      ON CONFLICT (id) DO NOTHING`;
  }
  async listEvents(tenant?: string, limit = 200) {
    await ensureTables(this.sql);
    const rows = tenant
      ? (await this.sql`SELECT data FROM business_events WHERE tenant = ${tenant} ORDER BY timestamp DESC LIMIT ${limit}`) as { data: BusinessEvent }[]
      : (await this.sql`SELECT data FROM business_events ORDER BY timestamp DESC LIMIT ${limit}`) as { data: BusinessEvent }[];
    return rows.map((r) => r.data);
  }
  async saveStatus(s: ConnectorStatus) {
    await ensureTables(this.sql);
    await this.sql`INSERT INTO connectors (id, state, version, last_sync_at, next_sync_at, events_produced, errors, data)
      VALUES (${s.id}, ${s.state}, ${s.version}, ${s.lastSyncAt}, ${s.nextSyncAt}, ${s.eventsProduced}, ${s.errors}, ${JSON.stringify(s)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, last_sync_at = EXCLUDED.last_sync_at,
        next_sync_at = EXCLUDED.next_sync_at, events_produced = EXCLUDED.events_produced, errors = EXCLUDED.errors,
        data = EXCLUDED.data, updated_at = now()`;
  }
  async listStatus() {
    await ensureTables(this.sql);
    const rows = (await this.sql`SELECT data FROM connectors`) as { data: ConnectorStatus }[];
    return rows.map((r) => r.data);
  }
  async appendSync(r: SyncRun) {
    await ensureTables(this.sql);
    await this.sql`INSERT INTO sync_history (id, connector, tenant, mode, started_at, duration_ms, records_processed, events_published, errors, ok)
      VALUES (${r.id}, ${r.connector}, ${r.tenant}, ${r.mode}, ${r.startedAt}, ${r.durationMs}, ${r.recordsProcessed}, ${r.eventsPublished}, ${r.errors}, ${r.ok})
      ON CONFLICT (id) DO NOTHING`;
  }
  async listSyncs(limit = 100) {
    await ensureTables(this.sql);
    const rows = (await this.sql`SELECT * FROM sync_history ORDER BY started_at DESC LIMIT ${limit}`) as Record<string, unknown>[];
    return rows.map((r): SyncRun => ({
      id: String(r.id), connector: r.connector as ConnectorId, tenant: String(r.tenant), mode: r.mode as SyncRun["mode"],
      startedAt: Number(r.started_at), finishedAt: null, durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
      recordsProcessed: Number(r.records_processed), eventsPublished: Number(r.events_published), errors: Number(r.errors), ok: Boolean(r.ok),
    }));
  }
}
