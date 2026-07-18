-- Milestone 4.5: production-owned CMO state. Apply with `npm run db:migrate`
-- before deploying code that serves /api/cmo/respond.
CREATE TABLE IF NOT EXISTS business_graph_snapshots (
  workspace_key TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  graph JSONB NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS decision_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_key TEXT NOT NULL,
  graph_version TEXT NOT NULL,
  request_kind TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  artifact JSONB NOT NULL,
  evidence JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_decision_artifacts_workspace_created
  ON decision_artifacts (workspace_key, created_at DESC);

CREATE TABLE IF NOT EXISTS decision_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_artifact_id UUID NOT NULL REFERENCES decision_artifacts(id),
  event TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_decision_events_artifact
  ON decision_events (decision_artifact_id, created_at);

CREATE TABLE IF NOT EXISTS cmo_response_cache (
  cache_key TEXT PRIMARY KEY,
  workspace_key TEXT NOT NULL,
  graph_version TEXT NOT NULL,
  response JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cmo_response_cache_expiry ON cmo_response_cache (expires_at);

ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS mission_id UUID;
ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS creative_brief JSONB;
ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS audience TEXT;
ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS dependencies JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS performance JSONB;
ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS brand_score REAL;
ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS taste_score REAL;
ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS reasoning_trace JSONB;
