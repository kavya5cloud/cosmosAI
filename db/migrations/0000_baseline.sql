-- Baseline schema (0000). Authoritative DDL extracted from the lib/ ensure* functions.
-- Idempotent (IF NOT EXISTS). Run with: npm run db:migrate

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

CREATE TABLE IF NOT EXISTS workspaces (
    wsid TEXT PRIMARY KEY,
    state JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

CREATE TABLE IF NOT EXISTS websites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_key TEXT NOT NULL,
    url TEXT NOT NULL,
    host TEXT NOT NULL,
    first_analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_key, host)
  );

CREATE TABLE IF NOT EXISTS marketing_channels (
    channel TEXT PRIMARY KEY,
    label TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS business_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_key TEXT NOT NULL,
    website TEXT NOT NULL,
    version INT NOT NULL,
    profile JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

CREATE TABLE IF NOT EXISTS recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_key TEXT NOT NULL,
    website TEXT NOT NULL,
    host TEXT NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    rec_type TEXT NOT NULL,
    channel TEXT NOT NULL,
    title TEXT NOT NULL,
    action_label TEXT,
    priority INT,
    confidence REAL,
    reasoning TEXT,
    expected_outcome TEXT,
    estimated_effort TEXT,
    estimated_impact TEXT,
    prompt_version TEXT NOT NULL,
    provider TEXT,
    model TEXT,
    snapshot_version TEXT,
    business_profile_id UUID,
    client_key TEXT
  );

CREATE INDEX IF NOT EXISTS idx_recs_ws ON recommendations (workspace_key, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_recs_host ON recommendations (host, generated_at DESC);

CREATE TABLE IF NOT EXISTS recommendation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID NOT NULL REFERENCES recommendations(id),
    event TEXT NOT NULL,
    actor TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

CREATE INDEX IF NOT EXISTS idx_rec_events_rec ON recommendation_events (recommendation_id, created_at);

CREATE TABLE IF NOT EXISTS content_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID REFERENCES recommendations(id),
    workspace_key TEXT NOT NULL,
    channel TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

CREATE TABLE IF NOT EXISTS outcome_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_key TEXT NOT NULL,
    site_url TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'gsc',
    period_days INT NOT NULL,
    metrics JSONB NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

CREATE INDEX IF NOT EXISTS idx_snapshots_ws ON outcome_snapshots (workspace_key, site_url, captured_at DESC);

CREATE TABLE IF NOT EXISTS recommendation_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID NOT NULL REFERENCES recommendations(id),
    before_snapshot_id UUID REFERENCES outcome_snapshots(id),
    after_snapshot_id UUID REFERENCES outcome_snapshots(id),
    delta JSONB NOT NULL,
    association_score REAL NOT NULL,
    expected_roi REAL,
    confidence REAL NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (recommendation_id, before_snapshot_id, after_snapshot_id)
  );

CREATE OR REPLACE VIEW approval_history AS
    SELECT e.id, e.recommendation_id, r.workspace_key, r.channel, r.title,
           e.event, e.actor, e.created_at
    FROM recommendation_events e
    JOIN recommendations r ON r.id = e.recommendation_id
    WHERE e.event IN ('approved', 'dismissed', 'published');

CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_key TEXT NOT NULL,
    website TEXT NOT NULL,
    goal TEXT NOT NULL,
    title TEXT NOT NULL,
    brief JSONB NOT NULL,
    channels TEXT[] NOT NULL,
    timeline_days INT NOT NULL,
    priority INT NOT NULL DEFAULT 3,
    expected_impact TEXT NOT NULL,
    reasoning TEXT NOT NULL,
    tasks JSONB NOT NULL,
    business_profile_snapshot JSONB,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

CREATE INDEX IF NOT EXISTS idx_campaigns_ws ON campaigns (workspace_key, created_at DESC);

CREATE TABLE IF NOT EXISTS campaign_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id),
    event TEXT NOT NULL,
    actor TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

CREATE INDEX IF NOT EXISTS idx_campaign_events ON campaign_events (campaign_id, created_at);

ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS campaign_id UUID;

ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS asset_type TEXT;

ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS purpose TEXT;

ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';

ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS parent_asset_id UUID;

ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS root_id UUID;

ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS structure JSONB;

ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS mission_id UUID;

ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS creative_brief JSONB;

ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS audience TEXT;

ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS dependencies JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS performance JSONB;

ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS brand_score REAL;

ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS taste_score REAL;

ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS reasoning_trace JSONB;

CREATE INDEX IF NOT EXISTS idx_assets_campaign ON content_assets (campaign_id, created_at);

CREATE INDEX IF NOT EXISTS idx_assets_root ON content_assets (root_id, version);

CREATE TABLE IF NOT EXISTS asset_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES content_assets(id),
    event TEXT NOT NULL,
    actor TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

CREATE INDEX IF NOT EXISTS idx_asset_events ON asset_events (asset_id, created_at);

CREATE TABLE IF NOT EXISTS google_tokens (
    user_id TEXT PRIMARY KEY,
    access_token TEXT,
    refresh_token TEXT,
    expiry BIGINT,
    site_url TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

CREATE TABLE IF NOT EXISTS notification_prefs (
    user_id TEXT PRIMARY KEY,
    prefs JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

CREATE TABLE IF NOT EXISTS sent_reminders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    reminder_key TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

CREATE INDEX IF NOT EXISTS sent_reminders_user_key ON sent_reminders (user_id, reminder_key, sent_at);

CREATE TABLE IF NOT EXISTS early_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    company TEXT,
    website TEXT,
    industry TEXT,
    marketing_challenge TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    notes TEXT
  );

CREATE INDEX IF NOT EXISTS idx_ea_created ON early_access (created_at DESC);

CREATE TABLE IF NOT EXISTS analysis_cache (
    cache_key TEXT PRIMARY KEY,
    url TEXT,
    result TEXT NOT NULL,
    provider TEXT,
    model TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

CREATE TABLE IF NOT EXISTS site_cache (
    url TEXT PRIMARY KEY,
    html_hash TEXT NOT NULL,
    summary TEXT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

-- seed the marketing channel catalog
INSERT INTO marketing_channels (channel, label) VALUES
  ('reddit','Reddit'),('seo','SEO'),('geo','AI search (GEO)'),('x','X (Twitter)'),('linkedin','LinkedIn'),('articles','Articles'),('hn','Hacker News')
ON CONFLICT (channel) DO NOTHING;
