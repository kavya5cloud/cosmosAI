-- Milestone 6: Content Studio orchestration. Apply with `npm run db:migrate`.
--
-- Two append-only stores: generation_events (never lose generation history) and
-- media_assets (the searchable Media Library). Both are workspace-scoped and additive.

CREATE TABLE IF NOT EXISTS generation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  workspace_key TEXT NOT NULL,
  modality TEXT NOT NULL,
  kind TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  provider_version TEXT NOT NULL,
  cost REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  prompt_hash TEXT NOT NULL,
  cached BOOLEAN NOT NULL DEFAULT false,
  brief JSONB,
  mission TEXT,
  campaign_id UUID,
  asset_root_id UUID,
  approval TEXT NOT NULL DEFAULT 'PENDING',
  council_score REAL,
  performance JSONB
);

CREATE INDEX IF NOT EXISTS idx_genevents_ws ON generation_events (workspace_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_genevents_hash ON generation_events (prompt_hash);
CREATE INDEX IF NOT EXISTS idx_genevents_asset ON generation_events (asset_root_id);

CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  workspace_key TEXT NOT NULL,
  media_type TEXT NOT NULL,
  uri TEXT NOT NULL,
  mime TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  kind TEXT,
  provider_id TEXT,
  asset_root_id UUID,
  bytes BIGINT,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  meta JSONB
);

CREATE INDEX IF NOT EXISTS idx_media_ws ON media_assets (workspace_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_type ON media_assets (workspace_key, media_type);
