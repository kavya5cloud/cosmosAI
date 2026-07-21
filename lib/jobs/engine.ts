import { QueueManager, type QueueEntry } from "./queue";
import { WorkerPool, type RunOutcome } from "./worker";
import { JobEventBus } from "./events";
import { InMemoryJobStore, type JobStore } from "./store";
import { runStage, type StageContext } from "./handlers";
import { percentFor, stagesFor } from "./pipeline";
import {
  type Job, type JobEvent, type JobEventType, type JobInput, type JobLog, type JobPriority,
  type JobProgress, type JobRefs, type JobResult, type JobState, type JobType, type QueueMetrics,
} from "./types";

// Job Engine — the central execution layer. Every AI request becomes a Job here; nothing
// bypasses it. It owns the queue, the worker pool, the event bus and history. Deterministic
// with an injectable clock; stage work is delegated to the existing engines (handlers.ts).

let seq = 0;
const emptyRefs = (): JobRefs => ({ assetIds: [], campaignIds: [], missionIds: [], creativeBriefIds: [], specIds: [] });
const emptyResult = (): JobResult => ({ outputs: {}, provider: null, modelVersion: null, cost: 0, approval: null, publishing: null, learning: null });

export type JobEngineOptions = {
  now?: () => number;
  concurrency?: number;
  maxRetries?: number;
  store?: JobStore;
  avgStageMs?: number;
  /** Deterministic failure injection for tests: fail this state until `attempts` reaches it. */
  failState?: JobState;
  failUntilAttempt?: number;
  /** Real per-stage delay (ms) so live progress advances believably. 0 in tests. */
  stageDelayMs?: number;
};

export class JobEngine {
  readonly queue: QueueManager;
  readonly bus = new JobEventBus();
  readonly store: JobStore;
  private pool: WorkerPool;
  private jobs = new Map<string, Job>();
  private logsByJob = new Map<string, JobLog[]>();
  private idem = new Map<string, string>();
  private now: () => number;
  private maxRetries: number;
  private avgStageMs: number;
  private providerUsage: Record<string, number> = {};
  private opts: JobEngineOptions;

  constructor(opts: JobEngineOptions = {}) {
    this.opts = opts;
    this.now = opts.now ?? Date.now;
    this.maxRetries = opts.maxRetries ?? 2;
    this.avgStageMs = opts.avgStageMs ?? 1200;
    this.store = opts.store ?? new InMemoryJobStore();
    this.queue = new QueueManager({ now: this.now, concurrency: opts.concurrency ?? 3, avgDurationMs: this.avgStageMs * 6 });
    this.pool = new WorkerPool({ queue: this.queue, concurrency: opts.concurrency ?? 3, now: this.now, run: (e) => this.execute(e) });
  }

  // ---- creation ----

  createJob(type: JobType, input: JobInput = {}, opts: { priority?: JobPriority; idempotencyKey?: string; maxRetries?: number } = {}): Job {
    if (opts.idempotencyKey && this.idem.has(opts.idempotencyKey)) {
      return this.jobs.get(this.idem.get(opts.idempotencyKey)!)!;
    }
    const id = `job_${(this.now()).toString(36)}_${(seq++).toString(36)}`;
    const stages = stagesFor(type, { publish: !!input.publish });
    const t = this.now();
    const job: Job = {
      id, type, state: "queued", priority: opts.priority ?? "normal", progress: 0,
      input, refs: emptyRefs(), result: null, error: null, attempts: 0,
      maxRetries: opts.maxRetries ?? this.maxRetries, idempotencyKey: opts.idempotencyKey ?? null,
      cost: 0, createdAt: t, startedAt: null, updatedAt: t, completedAt: null,
      estimatedCompletion: t + stages.length * this.avgStageMs, stages, cursor: 0, // cursor 0 = "queued" done
    };
    this.jobs.set(id, job);
    if (opts.idempotencyKey) this.idem.set(opts.idempotencyKey, id);
    this.emit(job, "created");
    const accepted = this.queue.enqueue({ id, type, priority: job.priority, createdAt: t });
    if (!accepted) { job.state = "waiting_for_resources"; this.log(job, "warn", "High demand — waiting for resources"); }
    this.emit(job, "queued");
    void this.store.saveJob(job);
    return job;
  }

  // ---- execution (called by the worker pool) ----

  private async execute(entry: QueueEntry): Promise<RunOutcome> {
    const job = this.jobs.get(entry.id);
    if (!job) return { ok: false, retry: false };
    if (job.state === "cancelled" || job.state === "paused") return { ok: false, retry: false };
    if (job.startedAt == null) { job.startedAt = this.now(); this.emit(job, "started"); }

    const ctx: StageContext = { job, log: (level, message) => this.log(job, level, message) };

    for (let i = job.cursor + 1; i < job.stages.length; i++) {
      const cur = this.jobs.get(job.id)!;
      if (cur.state === "paused" || cur.state === "cancelled") return { ok: false, retry: false };

      const stage = job.stages[i];
      job.state = stage;

      // deterministic failure injection for retry tests
      const shouldFail = this.opts.failState === stage && job.attempts < (this.opts.failUntilAttempt ?? 0);
      if (shouldFail) {
        job.attempts += 1;
        job.error = `stage ${stage} failed`;
        job.updatedAt = this.now();
        if (job.attempts <= job.maxRetries) {
          this.emit(job, "retrying", { stage, attempt: job.attempts });
          this.log(job, "warn", `Retrying after failure at ${stage} (attempt ${job.attempts})`);
          void this.store.saveJob(job);
          return { ok: false, retry: true };
        }
        job.state = "failed";
        this.emit(job, "failed", { stage });
        this.log(job, "error", `Failed at ${stage} after ${job.attempts} attempts`);
        void this.store.saveJob(job);
        return { ok: false, retry: false };
      }

      this.emit(job, "stage", { stage });
      const out = runStage(stage, ctx);
      this.applyOutput(job, out);
      job.cursor = i;
      job.progress = percentFor(job.stages, stage);
      job.updatedAt = this.now();
      job.estimatedCompletion = (job.startedAt ?? job.createdAt) + job.stages.length * this.avgStageMs;
      this.emit(job, "progress", { stage });
      void this.store.saveJob(job);
      if (this.opts.stageDelayMs) await new Promise((r) => setTimeout(r, this.opts.stageDelayMs));
    }

    job.state = "completed";
    job.progress = 100;
    job.completedAt = this.now();
    job.updatedAt = this.now();
    this.emit(job, "completed");
    void this.store.saveJob(job);
    return { ok: true };
  }

  private applyOutput(job: Job, out: ReturnType<typeof runStage>) {
    if (out.result) {
      job.result = { ...(job.result ?? emptyResult()), ...out.result, outputs: { ...(job.result?.outputs ?? {}), ...(out.result.outputs ?? {}) } };
      if (out.result.provider) this.providerUsage[out.result.provider] = (this.providerUsage[out.result.provider] ?? 0) + 1;
    }
    if (out.refs) {
      const r = job.refs;
      job.refs = {
        assetIds: [...r.assetIds, ...(out.refs.assetIds ?? [])],
        campaignIds: [...new Set([...r.campaignIds, ...(out.refs.campaignIds ?? [])])],
        missionIds: [...new Set([...r.missionIds, ...(out.refs.missionIds ?? [])])],
        creativeBriefIds: [...r.creativeBriefIds, ...(out.refs.creativeBriefIds ?? [])],
        specIds: [...r.specIds, ...(out.refs.specIds ?? [])],
      };
    }
    if (out.cost) { job.cost += out.cost; if (job.result) job.result.cost = job.cost; }
  }

  /** Run the whole queue to completion (drives the worker pool). */
  async drain(): Promise<void> { await this.pool.drain(); }

  /** Convenience: create + run a single job to a terminal state. */
  async run(type: JobType, input?: JobInput, opts?: { priority?: JobPriority; idempotencyKey?: string }): Promise<Job> {
    const job = this.createJob(type, input, opts);
    await this.drain();
    return this.jobs.get(job.id)!;
  }

  // ---- control ----

  cancel(id: string): boolean {
    const job = this.jobs.get(id); if (!job || this.isTerminal(job)) return false;
    this.queue.remove(id); job.state = "cancelled"; job.updatedAt = this.now();
    this.emit(job, "cancelled"); void this.store.saveJob(job); return true;
  }
  pause(id: string): boolean {
    const job = this.jobs.get(id); if (!job || this.isTerminal(job) || job.state === "paused") return false;
    this.queue.remove(id); job.state = "paused"; job.updatedAt = this.now();
    this.emit(job, "paused"); void this.store.saveJob(job); return true;
  }
  resume(id: string): boolean {
    const job = this.jobs.get(id); if (!job || job.state !== "paused") return false;
    job.state = job.stages[Math.max(0, job.cursor)]; job.updatedAt = this.now();
    this.queue.enqueue({ id, type: job.type, priority: job.priority, createdAt: this.now() });
    this.emit(job, "resumed"); void this.store.saveJob(job); return true;
  }
  retry(id: string): boolean {
    const job = this.jobs.get(id); if (!job) return false;
    if (job.state !== "failed" && job.state !== "timed_out" && job.state !== "cancelled") return false;
    job.state = job.stages[Math.max(0, job.cursor)]; job.error = null; job.updatedAt = this.now();
    this.queue.enqueue({ id, type: job.type, priority: job.priority, createdAt: this.now() });
    this.emit(job, "retrying"); void this.store.saveJob(job); return true;
  }

  private isTerminal(job: Job) { return ["completed", "cancelled", "failed", "timed_out"].includes(job.state); }

  // ---- queries ----

  getJob(id: string): Job | null { const j = this.jobs.get(id); return j ? { ...j } : null; }
  listJobs(): Job[] { return [...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt); }
  logs(id: string): JobLog[] { return [...(this.logsByJob.get(id) ?? [])]; }
  events(id: string): JobEvent[] { return this.bus.events(id); }

  progress(id: string): JobProgress | null {
    const job = this.jobs.get(id); if (!job) return null;
    return {
      jobId: job.id, type: job.type, state: job.state, percent: job.progress,
      startedAt: job.startedAt, updatedAt: job.updatedAt, estimatedCompletion: job.estimatedCompletion,
      provider: job.result?.provider ?? null, cost: job.cost,
      durationMs: job.startedAt ? (job.completedAt ?? job.updatedAt) - job.startedAt : null,
      refs: job.refs, stages: job.stages, logs: this.logs(id),
      // include live queue signals for the AI Processing experience
      ...(job.state === "queued" || job.state === "waiting_for_resources"
        ? { estimatedWaitMs: this.queue.estimatedWait(id), queuePosition: this.queue.position(id), highDemand: this.queue.highDemand() }
        : {}),
    } as JobProgress;
  }

  metrics(): QueueMetrics {
    const all = [...this.jobs.values()];
    const count = (s: JobState) => all.filter((j) => j.state === s).length;
    const done = all.filter((j) => j.state === "completed");
    const avgDurationMs = done.length ? Math.round(done.reduce((s, j) => s + ((j.completedAt ?? 0) - (j.startedAt ?? 0)), 0) / done.length) : 0;
    const avgCost = done.length ? Math.round((done.reduce((s, j) => s + j.cost, 0) / done.length) * 100) / 100 : 0;
    const running = all.filter((j) => !this.isTerminal(j) && j.state !== "queued" && j.state !== "waiting_for_resources" && j.state !== "paused").length;
    return {
      queued: count("queued") + count("waiting_for_resources"), running,
      completed: count("completed"), failed: count("failed") + count("timed_out"),
      retrying: count("retrying"), deadLetter: this.pool.deadLetter.length,
      avgDurationMs, avgCost, concurrency: this.queue.concurrency, workers: this.pool.workers,
      providerUsage: { ...this.providerUsage }, systemLoad: Math.min(1, running / this.queue.concurrency),
    };
  }

  // ---- internals ----

  private emit(job: Job, type: JobEventType, data?: Record<string, unknown>) {
    const e: JobEvent = { id: `${job.id}:${this.bus.events(job.id).length}`, jobId: job.id, type, state: job.state, progress: job.progress, at: this.now(), data };
    this.bus.emit(e);
    void this.store.appendEvent(e);
  }
  private log(job: Job, level: JobLog["level"], message: string) {
    const l: JobLog = { jobId: job.id, at: this.now(), level, message };
    (this.logsByJob.get(job.id) ?? this.logsByJob.set(job.id, []).get(job.id)!).push(l);
    void this.store.appendLog(l);
  }
}
