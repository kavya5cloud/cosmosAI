-- Milestone 7: Launch Engine. Apply with `npm run db:migrate`.
--
-- A launch is one row holding its full deterministic LaunchPlan (campaigns, timeline,
-- dependencies, publishing schedule, experiments, risks). Workspace-scoped, additive.

CREATE TABLE IF NOT EXISTS launches (
  launch_id TEXT NOT NULL,
  workspace_key TEXT NOT NULL,
  launch_type TEXT NOT NULL,
  mission TEXT NOT NULL,
  plan JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_key, launch_id)
);

CREATE INDEX IF NOT EXISTS idx_launches_ws ON launches (workspace_key, updated_at DESC);
