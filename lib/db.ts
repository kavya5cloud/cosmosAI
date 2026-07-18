import { neon } from "@neondatabase/serverless";

export function db() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url);
}

export type Sql = NonNullable<ReturnType<typeof db>>;

// In production, schema is owned by migrations (npm run db:migrate) and request-time DDL
// is disabled with SKIP_RUNTIME_DDL=true. In dev/test the ensure* guards still create
// tables on first use so the app runs without a manual migrate step. Either way the DDL
// is idempotent (IF NOT EXISTS) and each ensure* runs at most once per process.
export const RUNTIME_DDL = process.env.SKIP_RUNTIME_DDL !== "true";

let schemaReady = false;
export async function ensureSchema(sql: Sql) {
  if (schemaReady) return;
  if (!RUNTIME_DDL) { schemaReady = true; return; }
  await sql`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS workspaces (
    wsid TEXT PRIMARY KEY,
    state JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  schemaReady = true;
}
