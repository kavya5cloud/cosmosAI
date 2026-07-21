import { PRIORITY_RANK, type JobPriority, type JobType } from "./types";

// Queue Manager — priority scheduling, wait estimation, queue position, backpressure,
// rate limiting, provider availability / cooldown and high-load routing. Deterministic:
// an injectable clock, no wall-clock coupling.

export type QueueEntry = { id: string; type: JobType; priority: JobPriority; createdAt: number };

export type QueueOptions = {
  now?: () => number;
  concurrency?: number;
  maxQueue?: number;                          // backpressure threshold
  highDemandAt?: number;                      // queue length that flips into high-demand
  rateLimitPerMin?: Partial<Record<JobType, number>>;
  avgDurationMs?: number;                     // baseline for wait estimates
};

export class QueueManager {
  private entries: QueueEntry[] = [];
  private now: () => number;
  readonly concurrency: number;
  private maxQueue: number;
  private highDemandAt: number;
  private rateLimit: Partial<Record<JobType, number>>;
  private avgDurationMs: number;
  private cooldowns = new Map<string, number>();       // provider → availableAt
  private typeWindow = new Map<JobType, number[]>();    // rate-limit timestamps

  constructor(opts: QueueOptions = {}) {
    this.now = opts.now ?? (() => 0);
    this.concurrency = opts.concurrency ?? 3;
    this.maxQueue = opts.maxQueue ?? 500;
    this.highDemandAt = opts.highDemandAt ?? 8;
    this.rateLimit = opts.rateLimitPerMin ?? {};
    this.avgDurationMs = opts.avgDurationMs ?? 4000;
  }

  /** Enqueue with backpressure. Returns false when the queue is saturated (high-load). */
  enqueue(entry: QueueEntry): boolean {
    if (this.entries.length >= this.maxQueue) return false;
    this.entries.push(entry);
    this.sort();
    return true;
  }

  private sort() {
    this.entries.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }

  /** Next eligible entry (respecting per-type rate limits), removing it from the queue. */
  dequeue(): QueueEntry | null {
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      if (this.rateLimited(e.type)) continue;
      this.entries.splice(i, 1);
      this.recordDispatch(e.type);
      return e;
    }
    return null;
  }

  remove(id: string): boolean {
    const i = this.entries.findIndex((e) => e.id === id);
    if (i < 0) return false;
    this.entries.splice(i, 1);
    return true;
  }

  /** 1-based position of a job in the queue (0 if not queued). */
  position(id: string): number {
    const i = this.entries.findIndex((e) => e.id === id);
    return i < 0 ? 0 : i + 1;
  }

  /** Estimated wait (ms) before a job starts, given concurrency + avg duration. */
  estimatedWait(id: string, avgDurationMs = this.avgDurationMs): number {
    const pos = this.position(id);
    if (pos <= 0) return 0;
    return Math.ceil((pos - 1) / this.concurrency) * avgDurationMs;
  }

  size(): number { return this.entries.length; }
  highDemand(): boolean { return this.entries.length >= this.highDemandAt; }
  peek(): QueueEntry[] { return [...this.entries]; }

  // ---- provider availability / cooldown ----
  setCooldown(provider: string, ms: number) { this.cooldowns.set(provider, this.now() + ms); }
  available(provider: string): boolean {
    const until = this.cooldowns.get(provider);
    return until == null || this.now() >= until;
  }

  // ---- per-type rate limiting (sliding 60s window) ----
  private rateLimited(type: JobType): boolean {
    const limit = this.rateLimit[type];
    if (!limit) return false;
    const win = (this.typeWindow.get(type) ?? []).filter((t) => t > this.now() - 60_000);
    this.typeWindow.set(type, win);
    return win.length >= limit;
  }
  private recordDispatch(type: JobType) {
    if (!this.rateLimit[type]) return;
    const win = this.typeWindow.get(type) ?? [];
    win.push(this.now());
    this.typeWindow.set(type, win);
  }
}
