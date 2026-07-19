import { type Sql, RUNTIME_DDL } from "@/lib/db";
import type { LaunchPlan } from "@/lib/launch/types";

// Launch store — persists the deterministic LaunchPlan JSON. Repository pattern:
// in-memory for tests/dev, Neon for production. The plan is the source of truth; the
// update/publish/experiment APIs mutate it and save it back.

export type LaunchRecord = {
  launchId: string;
  workspaceKey: string;
  launchType: string;
  mission: string;
  plan: LaunchPlan;
  createdAt: string;
  updatedAt: string;
};

export interface LaunchRepo {
  save(workspaceKey: string, plan: LaunchPlan): Promise<LaunchRecord>;
  get(workspaceKey: string, launchId: string): Promise<LaunchRecord | null>;
  list(workspaceKey: string, limit?: number): Promise<LaunchRecord[]>;
}

export class InMemoryLaunchRepo implements LaunchRepo {
  private rows = new Map<string, LaunchRecord>();
  private k(ws: string, id: string) { return `${ws}::${id}`; }

  async save(workspaceKey: string, plan: LaunchPlan): Promise<LaunchRecord> {
    const key = this.k(workspaceKey, plan.launchId);
    const now = new Date().toISOString();
    const existing = this.rows.get(key);
    const rec: LaunchRecord = {
      launchId: plan.launchId, workspaceKey, launchType: plan.launchType, mission: plan.mission,
      plan, createdAt: existing?.createdAt ?? now, updatedAt: now,
    };
    this.rows.set(key, rec);
    return rec;
  }
  async get(workspaceKey: string, launchId: string): Promise<LaunchRecord | null> {
    return this.rows.get(this.k(workspaceKey, launchId)) ?? null;
  }
  async list(workspaceKey: string, limit = 50): Promise<LaunchRecord[]> {
    return [...this.rows.values()]
      .filter((r) => r.workspaceKey === workspaceKey)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }
}

let launchReady = false;
async function ensureLaunchTable(sql: Sql) {
  if (launchReady) return;
  if (!RUNTIME_DDL) { launchReady = true; return; }
  await sql`CREATE TABLE IF NOT EXISTS launches (
    launch_id TEXT NOT NULL, workspace_key TEXT NOT NULL, launch_type TEXT NOT NULL,
    mission TEXT NOT NULL, plan JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_key, launch_id)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_launches_ws ON launches (workspace_key, updated_at DESC)`;
  launchReady = true;
}

type Row = { launch_id: string; workspace_key: string; launch_type: string; mission: string; plan: unknown; created_at: string; updated_at: string };
function toRecord(r: Row): LaunchRecord {
  return {
    launchId: r.launch_id, workspaceKey: r.workspace_key, launchType: r.launch_type, mission: r.mission,
    plan: r.plan as LaunchPlan, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export class NeonLaunchRepo implements LaunchRepo {
  constructor(private sql: Sql) {}

  async save(workspaceKey: string, plan: LaunchPlan): Promise<LaunchRecord> {
    await ensureLaunchTable(this.sql);
    const rows = (await this.sql`
      INSERT INTO launches (launch_id, workspace_key, launch_type, mission, plan)
      VALUES (${plan.launchId}, ${workspaceKey}, ${plan.launchType}, ${plan.mission}, ${JSON.stringify(plan)}::jsonb)
      ON CONFLICT (workspace_key, launch_id) DO UPDATE SET
        plan = EXCLUDED.plan, mission = EXCLUDED.mission, launch_type = EXCLUDED.launch_type, updated_at = now()
      RETURNING *`) as Row[];
    return toRecord(rows[0]);
  }
  async get(workspaceKey: string, launchId: string): Promise<LaunchRecord | null> {
    await ensureLaunchTable(this.sql);
    const rows = (await this.sql`SELECT * FROM launches WHERE workspace_key = ${workspaceKey} AND launch_id = ${launchId}`) as Row[];
    return rows[0] ? toRecord(rows[0]) : null;
  }
  async list(workspaceKey: string, limit = 50): Promise<LaunchRecord[]> {
    await ensureLaunchTable(this.sql);
    const rows = (await this.sql`SELECT * FROM launches WHERE workspace_key = ${workspaceKey} ORDER BY updated_at DESC LIMIT ${limit}`) as Row[];
    return rows.map(toRecord);
  }
}
