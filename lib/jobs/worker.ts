import type { QueueManager, QueueEntry } from "./queue";
import type { WorkerStatus } from "./types";

// Worker pool — executes queued jobs asynchronously with a concurrency limit, retry
// re-queueing, a dead-letter queue, timeouts and graceful shutdown. It is a pure driver:
// the actual stage execution lives in the run() callback (the Job Engine). Deterministic
// when run() is deterministic.

export type RunOutcome = { ok: boolean; retry?: boolean; timedOut?: boolean };
export type RunFn = (entry: QueueEntry) => Promise<RunOutcome>;

export type WorkerPoolOptions = {
  queue: QueueManager;
  run: RunFn;
  concurrency?: number;
  workerCount?: number;
  timeoutMs?: number;
  now?: () => number;
};

export class WorkerPool {
  private queue: QueueManager;
  private run: RunFn;
  private concurrency: number;
  private timeoutMs?: number;
  private stopped = false;
  private draining = false;
  readonly workers: WorkerStatus[];
  readonly deadLetter: QueueEntry[] = [];

  constructor(opts: WorkerPoolOptions) {
    this.queue = opts.queue;
    this.run = opts.run;
    this.concurrency = opts.concurrency ?? 3;
    this.timeoutMs = opts.timeoutMs;
    this.workers = Array.from({ length: opts.workerCount ?? this.concurrency }, (_, i) => ({
      id: `w${i + 1}`, busy: false, currentJobId: null, processed: 0, failed: 0,
    }));
  }

  /** Process the queue to completion, honoring concurrency. Safe to call repeatedly. */
  async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (!this.stopped) {
        const batch: QueueEntry[] = [];
        while (batch.length < this.concurrency) {
          const e = this.queue.dequeue();
          if (!e) break;
          batch.push(e);
        }
        if (batch.length === 0) break;
        await Promise.all(batch.map((e, i) => this.execute(e, this.workers[i % this.workers.length])));
      }
    } finally {
      this.draining = false;
    }
  }

  private async execute(entry: QueueEntry, worker: WorkerStatus): Promise<void> {
    worker.busy = true;
    worker.currentJobId = entry.id;
    try {
      const outcome = await this.withTimeout(this.run(entry));
      if (outcome.ok) {
        worker.processed += 1;
      } else if (outcome.retry) {
        this.queue.enqueue(entry); // re-queue for another attempt
      } else {
        this.deadLetter.push(entry);
        worker.failed += 1;
      }
    } catch {
      this.deadLetter.push(entry);
      worker.failed += 1;
    } finally {
      worker.busy = false;
      worker.currentJobId = null;
    }
  }

  private withTimeout(p: Promise<RunOutcome>): Promise<RunOutcome> {
    if (!this.timeoutMs) return p;
    return Promise.race([
      p,
      new Promise<RunOutcome>((resolve) => setTimeout(() => resolve({ ok: false, retry: false, timedOut: true }), this.timeoutMs)),
    ]);
  }

  /** Graceful shutdown — finishes in-flight work, stops pulling new jobs. */
  stop() { this.stopped = true; }
  resume() { this.stopped = false; }
  busyCount(): number { return this.workers.filter((w) => w.busy).length; }
}
