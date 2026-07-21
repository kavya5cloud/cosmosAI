-- Milestone 12: Integration & Connector Platform. Apply with `npm run db:migrate`.
-- The data-ingestion layer's durable, append-only history: business_events (the canonical
-- integration contract), connector status snapshots and sync history. Connectors only
-- publish events here; nothing writes to business objects directly. Runtime ensure* guards
-- mirror this for dev/test.

CREATE TABLE IF NOT EXISTS business_events (
  id TEXT PRIMARY KEY,
  tenant TEXT NOT NULL,
  connector TEXT NOT NULL,
  type TEXT NOT NULL,
  entity TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  timestamp BIGINT NOT NULL,
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_be_tenant ON business_events (tenant, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_be_connector ON business_events (connector, timestamp DESC);

CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  version TEXT,
  last_sync_at BIGINT,
  next_sync_at BIGINT,
  events_produced INT NOT NULL DEFAULT 0,
  errors INT NOT NULL DEFAULT 0,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_history (
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
);
CREATE INDEX IF NOT EXISTS idx_sync_connector ON sync_history (connector, started_at DESC);
