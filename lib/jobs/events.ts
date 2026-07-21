import type { JobEvent } from "./types";

// Job event bus — the Job Engine is event-driven. Every state transition and progress
// tick emits a JobEvent; subscribers (SSE streams, the dashboard, the Learning Engine,
// mobile notifications) react. Append-only in-memory log + synchronous subscribers.

export type JobEventHandler = (e: JobEvent) => void;

export class JobEventBus {
  private log: JobEvent[] = [];
  private handlers = new Set<JobEventHandler>();
  private byJob = new Set<{ jobId: string; fn: JobEventHandler }>();

  emit(e: JobEvent): JobEvent {
    this.log.push(e);
    for (const h of this.handlers) h(e);
    for (const s of this.byJob) if (s.jobId === e.jobId) s.fn(e);
    return e;
  }

  subscribe(handler: JobEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Subscribe to a single job's events (used by SSE streams). */
  subscribeJob(jobId: string, fn: JobEventHandler): () => void {
    const s = { jobId, fn };
    this.byJob.add(s);
    return () => this.byJob.delete(s);
  }

  events(jobId?: string): JobEvent[] {
    return jobId ? this.log.filter((e) => e.jobId === jobId) : [...this.log];
  }

  clear(): void { this.log = []; }
}
