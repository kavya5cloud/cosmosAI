-- Milestone 11: Job Orchestration Engine. Apply with `npm run db:migrate`.
-- The central execution layer's durable, append-only history: jobs (latest snapshot),
-- job_events (event-sourced transitions), job_logs, plus worker + queue metric snapshots.
-- The engine is deterministic; these tables persist history and never lose it. Runtime
-- ensure* guards mirror jobs/job_events/job_logs for dev/test.

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  state TEXT NOT NULL,
  priority TEXT NOT NULL,
  progress INT NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  attempts INT NOT NULL DEFAULT 0,
  workspace_key TEXT,
  idempotency_key TEXT,
  data JSONB NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs (state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_idem ON jobs (idempotency_key);

CREATE TABLE IF NOT EXISTS job_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  type TEXT NOT NULL,
  state TEXT NOT NULL,
  progress INT NOT NULL DEFAULT 0,
  at BIGINT NOT NULL,
  data JSONB
);
CREATE INDEX IF NOT EXISTS idx_job_events ON job_events (job_id, at);

CREATE TABLE IF NOT EXISTS job_logs (
  job_id TEXT NOT NULL,
  at BIGINT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_job_logs ON job_logs (job_id, at);

CREATE TABLE IF NOT EXISTS worker_status (
  id TEXT PRIMARY KEY,
  busy BOOLEAN NOT NULL DEFAULT false,
  current_job_id TEXT,
  processed INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS queue_metrics (
  at BIGINT PRIMARY KEY,
  queued INT NOT NULL DEFAULT 0,
  running INT NOT NULL DEFAULT 0,
  completed INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  avg_duration_ms INT NOT NULL DEFAULT 0,
  avg_cost REAL NOT NULL DEFAULT 0,
  system_load REAL NOT NULL DEFAULT 0
);
