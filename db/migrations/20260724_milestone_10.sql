-- Milestone 10: Learning Engine. Apply with `npm run db:migrate`.
-- Durable, VERSIONED intelligence learned from performance: the pattern library, brand
-- DNA history, business-graph signals and decision feedback. The engines are pure and
-- deterministic; these tables only persist what was learned. Runtime ensure* guards
-- mirror this for dev/test. (Creative Memory reuses ci_creative_memory from Milestone 8.)

CREATE TABLE IF NOT EXISTS learn_patterns (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  performance REAL NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  platform TEXT, audience TEXT, industry TEXT,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_learn_pat_kind ON learn_patterns (kind, performance DESC);

CREATE TABLE IF NOT EXISTS learn_brand_dna (
  workspace_key TEXT NOT NULL,
  version INT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_key, version)
);

CREATE TABLE IF NOT EXISTS learn_bg_signals (
  id TEXT PRIMARY KEY,
  workspace_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  performance REAL NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_learn_bg_ws ON learn_bg_signals (workspace_key, performance DESC);

CREATE TABLE IF NOT EXISTS learn_decision_feedback (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  predicted_impact REAL NOT NULL,
  predicted_confidence REAL NOT NULL,
  actual_performance REAL NOT NULL,
  deviation REAL NOT NULL,
  quality REAL NOT NULL,
  at BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
