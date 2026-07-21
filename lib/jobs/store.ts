import { type Sql, RUNTIME_DDL } from "@/lib/db";
import type { Job, JobEvent, JobLog } from "./types";

// Job history store — append-only events + logs and the latest job snapshot. Repository
// pattern: in-memory (default/tests) + Neon (durable, never loses history).

export interface JobStore {
  saveJob(job: Job): Promise<void>;
  getJob(id: string): Promise<Job | null>;
  listJobs(limit?: number): Promise<Job[]>;
  appendEvent(e: JobEvent): Promise<void>;
  appendLog(l: JobLog): Promise<void>;
  listEvents(jobId: string): Promise<JobEvent[]>;
  listLogs(jobId: string): Promise<JobLog[]>;
}

export class InMemoryJobStore implements JobStore {
  private jobs = new Map<string, Job>();
  private events: JobEvent[] = [];
  private logs: JobLog[] = [];
  async saveJob(job: Job) { this.jobs.set(job.id, { ...job }); }
  async getJob(id: string) { const j = this.jobs.get(id); return j ? { ...j } : null; }
  async listJobs(limit = 200) { return [...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit); }
  async appendEvent(e: JobEvent) { this.events.push(e); }
  async appendLog(l: JobLog) { this.logs.push(l); }
  async listEvents(jobId: string) { return this.events.filter((e) => e.jobId === jobId); }
  async listLogs(jobId: string) { return this.logs.filter((l) => l.jobId === jobId); }
}

let jobsReady = false;
async function ensureJobTables(sql: Sql) {
  if (jobsReady) return;
  if (!RUNTIME_DDL) { jobsReady = true; return; }
  await sql`CREATE TABLE IF NOT EXISTS jobs (
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
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs (state, created_at DESC)`;
  await sql`CREATE TABLE IF NOT EXISTS job_events (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    type TEXT NOT NULL,
    state TEXT NOT NULL,
    progress INT NOT NULL DEFAULT 0,
    at BIGINT NOT NULL,
    data JSONB
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_job_events ON job_events (job_id, at)`;
  await sql`CREATE TABLE IF NOT EXISTS job_logs (
    job_id TEXT NOT NULL,
    at BIGINT NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_job_logs ON job_logs (job_id, at)`;
  jobsReady = true;
}

export class NeonJobStore implements JobStore {
  constructor(private sql: Sql) {}
  async saveJob(job: Job) {
    await ensureJobTables(this.sql);
    await this.sql`INSERT INTO jobs (id, type, state, priority, progress, cost, attempts, workspace_key, idempotency_key, data, created_at, updated_at)
      VALUES (${job.id}, ${job.type}, ${job.state}, ${job.priority}, ${job.progress}, ${job.cost}, ${job.attempts},
              ${job.input.workspaceKey ?? null}, ${job.idempotencyKey}, ${JSON.stringify(job)}::jsonb, ${job.createdAt}, ${job.updatedAt})
      ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, progress = EXCLUDED.progress, cost = EXCLUDED.cost,
        attempts = EXCLUDED.attempts, data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`;
  }
  async getJob(id: string) {
    await ensureJobTables(this.sql);
    const rows = (await this.sql`SELECT data FROM jobs WHERE id = ${id}`) as { data: Job }[];
    return rows[0]?.data ?? null;
  }
  async listJobs(limit = 200) {
    await ensureJobTables(this.sql);
    const rows = (await this.sql`SELECT data FROM jobs ORDER BY created_at DESC LIMIT ${limit}`) as { data: Job }[];
    return rows.map((r) => r.data);
  }
  async appendEvent(e: JobEvent) {
    await ensureJobTables(this.sql);
    await this.sql`INSERT INTO job_events (id, job_id, type, state, progress, at, data)
      VALUES (${e.id}, ${e.jobId}, ${e.type}, ${e.state}, ${e.progress}, ${e.at}, ${e.data ? JSON.stringify(e.data) : null})
      ON CONFLICT (id) DO NOTHING`;
  }
  async appendLog(l: JobLog) {
    await ensureJobTables(this.sql);
    await this.sql`INSERT INTO job_logs (job_id, at, level, message) VALUES (${l.jobId}, ${l.at}, ${l.level}, ${l.message})`;
  }
  async listEvents(jobId: string) {
    await ensureJobTables(this.sql);
    const rows = (await this.sql`SELECT id, job_id, type, state, progress, at, data FROM job_events WHERE job_id = ${jobId} ORDER BY at`) as Record<string, unknown>[];
    return rows.map((r): JobEvent => ({ id: String(r.id), jobId: String(r.job_id), type: r.type as JobEvent["type"], state: r.state as JobEvent["state"], progress: Number(r.progress), at: Number(r.at), data: (r.data as Record<string, unknown>) ?? undefined }));
  }
  async listLogs(jobId: string) {
    await ensureJobTables(this.sql);
    const rows = (await this.sql`SELECT job_id, at, level, message FROM job_logs WHERE job_id = ${jobId} ORDER BY at`) as Record<string, unknown>[];
    return rows.map((r): JobLog => ({ jobId: String(r.job_id), at: Number(r.at), level: r.level as JobLog["level"], message: String(r.message) }));
  }
}
