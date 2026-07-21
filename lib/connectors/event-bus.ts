import type { BusinessEvent } from "./types";

// Business Event Bus (Part 7) — the only integration contract between connectors and the
// rest of Populr. Publish / subscribe / replay / deduplicate / ordering / retry / dead-
// letter / idempotency. Downstream (Business Graph, Learning, Decision Planner) subscribe
// here; connectors never touch business objects directly.

export type BusinessEventHandler = (e: BusinessEvent) => void;

export type Subscriber = { name: string; handle: BusinessEventHandler };

export type DeadLetter = { event: BusinessEvent; subscriber: string; error: string; attempts: number };

export class BusinessEventBus {
  private log: BusinessEvent[] = [];
  private seen = new Set<string>();               // idempotency (by event id)
  private subs: Subscriber[] = [];
  readonly deadLetter: DeadLetter[] = [];
  private maxRetries: number;

  constructor(opts: { maxRetries?: number } = {}) { this.maxRetries = opts.maxRetries ?? 2; }

  /** Publish an event. Deduplicated by id; delivered to every subscriber (ordered by ts). */
  publish(event: BusinessEvent): boolean {
    if (this.seen.has(event.id)) return false;      // dedupe / idempotent
    this.seen.add(event.id);
    this.log.push(event);
    this.log.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id)); // ordering
    for (const s of this.subs) this.deliver(s, event);
    return true;
  }

  publishBatch(events: BusinessEvent[]): number {
    let published = 0;
    for (const e of events) if (this.publish(e)) published++;
    return published;
  }

  private deliver(s: Subscriber, event: BusinessEvent) {
    let attempts = 0;
    // Retry with a bounded budget; exhausted deliveries go to the dead-letter queue.
    while (attempts <= this.maxRetries) {
      attempts++;
      try { s.handle(event); return; }
      catch (err) {
        if (attempts > this.maxRetries) {
          this.deadLetter.push({ event, subscriber: s.name, error: String(err).slice(0, 160), attempts });
          return;
        }
      }
    }
  }

  subscribe(name: string, handle: BusinessEventHandler): () => void {
    const s: Subscriber = { name, handle };
    this.subs.push(s);
    return () => { this.subs = this.subs.filter((x) => x !== s); };
  }

  /** Replay the (ordered) event log into a handler — for late subscribers / rebuilds. */
  replay(handle: BusinessEventHandler, filter?: (e: BusinessEvent) => boolean): number {
    const events = filter ? this.log.filter(filter) : this.log;
    for (const e of events) handle(e);
    return events.length;
  }

  events(tenant?: string): BusinessEvent[] {
    return tenant ? this.log.filter((e) => e.tenant === tenant) : [...this.log];
  }
  count(): number { return this.log.length; }
  subscribers(): string[] { return this.subs.map((s) => s.name); }
  clear(): void { this.log = []; this.seen.clear(); }
}
