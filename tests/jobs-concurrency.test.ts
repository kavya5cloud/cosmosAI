import { describe, it, expect } from "vitest";
import { JobEngine } from "@/lib/jobs/engine";
import { QueueManager } from "@/lib/jobs/queue";
import { WorkerPool } from "@/lib/jobs/worker";

const brief = {
  objective: "x", audience: "founders", keyMessage: "y", emotionalAngle: "z",
  proof: "p", cta: "c", visualDirection: "v", successMetric: "s",
};

describe("Concurrency + worker pool", () => {
  it("processes many queued jobs to completion", async () => {
    const engine = new JobEngine({ now: () => 0, concurrency: 3 });
    const ids = Array.from({ length: 8 }, () => engine.createJob("document", { brief, assetKind: "blog" }).id);
    await engine.drain();
    for (const id of ids) expect(engine.getJob(id)!.state).toBe("completed");
    expect(engine.metrics().completed).toBe(8);
  });

  it("worker pool respects concurrency and tracks worker status + dead-letter", async () => {
    const q = new QueueManager({ now: () => 0, concurrency: 2 });
    let maxInFlight = 0; let inFlight = 0;
    const pool = new WorkerPool({
      queue: q, concurrency: 2, workerCount: 2,
      run: async (e) => {
        inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight--;
        return { ok: e.id !== "bad", retry: false };
      },
    });
    for (const id of ["a", "b", "c", "d", "bad"]) q.enqueue({ id, type: "document", priority: "normal", createdAt: 0 });
    await pool.drain();
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(pool.deadLetter.map((e) => e.id)).toContain("bad");
    expect(pool.workers.reduce((s, w) => s + w.processed, 0)).toBe(4);
  });

  it("graceful shutdown stops pulling new work", async () => {
    const q = new QueueManager({ now: () => 0, concurrency: 1 });
    const pool = new WorkerPool({ queue: q, concurrency: 1, run: async () => ({ ok: true }) });
    for (const id of ["a", "b", "c"]) q.enqueue({ id, type: "document", priority: "normal", createdAt: 0 });
    pool.stop();
    await pool.drain();
    expect(q.size()).toBe(3); // nothing processed after stop
  });
});
