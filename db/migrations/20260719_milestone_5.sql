-- Milestone 5: Creative Foundation. Apply with `npm run db:migrate`
-- before deploying code that serves the new Early Access modal fields.
--
-- The Early Access modal collects only a work email as required; name is now
-- optional and three new fields are captured (team size, what they're building,
-- and interest areas). Additive + backwards-compatible with the existing page.

ALTER TABLE early_access ALTER COLUMN name DROP NOT NULL;
ALTER TABLE early_access ADD COLUMN IF NOT EXISTS team_size TEXT;
ALTER TABLE early_access ADD COLUMN IF NOT EXISTS project TEXT;
ALTER TABLE early_access ADD COLUMN IF NOT EXISTS interests JSONB NOT NULL DEFAULT '[]'::jsonb;
