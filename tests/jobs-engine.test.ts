import { describe, it, expect } from "vitest";
import { JobEngine } from "@/lib/jobs/engine";
import { QueueManager } from "@/lib/jobs/queue";
import { stagesFor } from "@/lib/jobs/pipeline";

const clock = () => { let t = 0; return () => (t += 100); };

const brief = {
  objective: "Launch to founders", audience: "founders", keyMessage: "an AI CMO that reasons",
  emotionalAngle: "calm confidence", proof: "deterministic engine", cta: "join early access",
  visualDirection: "clean", successMetric: "signups",
};

describe("Job pipeline", () => {
  it("gives each type its own stage flow; publishing is opt-in", () => {
    expect(stagesFor("strategy")).toContain("planning");
    expect(stagesFor("strategy")).not.toContain("generating");
    expect(stagesFor("video_generation")).toContain("generating");
    expect(stagesFor("document")).not.toContain("publishing");
    expect(stagesFor("document", { publish: true })).toContain("publishing");
  });
});

describe("Job Engine", () => {
  it("runs a job through the full pipeline to completed, emitting events", async () => {
    const engine = new JobEngine({ now: clock() });
    const job = await engine.run("document", { brief, assetKind: "blog" });
    expect(job.state).toBe("completed");
    expect(job.progress).toBe(100);
    expect(job.refs.specIds.length).toBe(1);       // creative intelligence ran
    expect(job.refs.assetIds.length).toBe(1);      // generation ran
    expect(job.result?.approval).toBeTruthy();     // creative director + approval ran
    expect(job.cost).toBeGreaterThan(0);
    const events = engine.events(job.id).map((e) => e.type);
    expect(events).toContain("created");
    expect(events).toContain("completed");
    expect(engine.logs(job.id).length).toBeGreaterThan(0);
  });

  it("tracks refs, cost and provider usage in metrics", async () => {
    const engine = new JobEngine({ now: clock() });
    await engine.run("image_generation", { brief, assetKind: "carousel" });
    const m = engine.metrics();
    expect(m.completed).toBe(1);
    expect(m.avgCost).toBeGreaterThan(0);
    expect(Object.keys(m.providerUsage)).toContain("ref-1");
  });

  it("is idempotent on idempotencyKey", () => {
    const engine = new JobEngine({ now: clock() });
    const a = engine.createJob("document", { brief }, { idempotencyKey: "k1" });
    const b = engine.createJob("document", { brief }, { idempotencyKey: "k1" });
    expect(a.id).toBe(b.id);
  });

  it("cancels, pauses and resumes jobs", async () => {
    const engine = new JobEngine({ now: clock() });
    const j = engine.createJob("video_generation", { brief, assetKind: "hero_video" });
    expect(engine.pause(j.id)).toBe(true);
    expect(engine.getJob(j.id)!.state).toBe("paused");
    await engine.drain(); // paused job is not executed
    expect(engine.getJob(j.id)!.state).toBe("paused");
    expect(engine.resume(j.id)).toBe(true);
    await engine.drain();
    expect(engine.getJob(j.id)!.state).toBe("completed");

    const c = engine.createJob("document", { brief });
    expect(engine.cancel(c.id)).toBe(true);
    await engine.drain();
    expect(engine.getJob(c.id)!.state).toBe("cancelled");
  });

  it("is deterministic (same input → same refs/cost/state)", async () => {
    const a = await new JobEngine({ now: clock() }).run("document", { brief, assetKind: "blog" });
    const b = await new JobEngine({ now: clock() }).run("document", { brief, assetKind: "blog" });
    expect(a.state).toBe(b.state);
    expect(a.cost).toBe(b.cost);
    expect(a.refs.specIds).toEqual(b.refs.specIds);
  });
});

describe("Retry + dead-letter", () => {
  it("retries a failing stage then dead-letters after max retries", async () => {
    const engine = new JobEngine({ now: clock(), maxRetries: 1, failState: "generating", failUntilAttempt: 99 });
    const job = await engine.run("image_generation", { brief, assetKind: "carousel" });
    expect(job.attempts).toBeGreaterThan(1);
    expect(job.state).toBe("failed");
    expect(engine.metrics().deadLetter).toBeGreaterThan(0);
    expect(engine.retry(job.id)).toBe(true); // can be retried back into the queue
  });

  it("recovers when the failure clears within the retry budget", async () => {
    const engine = new JobEngine({ now: clock(), maxRetries: 3, failState: "generating", failUntilAttempt: 2 });
    const job = await engine.run("image_generation", { brief, assetKind: "carousel" });
    expect(job.attempts).toBe(2);
    expect(job.state).toBe("completed");
  });
});

describe("Queue Manager", () => {
  it("orders by priority then creation time and reports position + wait", () => {
    const q = new QueueManager({ now: () => 0, concurrency: 1, avgDurationMs: 1000 });
    q.enqueue({ id: "a", type: "document", priority: "low", createdAt: 1 });
    q.enqueue({ id: "b", type: "document", priority: "high", createdAt: 2 });
    expect(q.position("b")).toBe(1); // high priority jumps ahead
    expect(q.estimatedWait("a")).toBe(1000); // one job ahead at concurrency 1
    expect(q.dequeue()!.id).toBe("b");
  });

  it("applies backpressure and flags high demand", () => {
    const q = new QueueManager({ now: () => 0, maxQueue: 2, highDemandAt: 2 });
    expect(q.enqueue({ id: "a", type: "document", priority: "normal", createdAt: 0 })).toBe(true);
    expect(q.enqueue({ id: "b", type: "document", priority: "normal", createdAt: 0 })).toBe(true);
    expect(q.highDemand()).toBe(true);
    expect(q.enqueue({ id: "c", type: "document", priority: "normal", createdAt: 0 })).toBe(false); // saturated
  });

  it("honors provider cooldown", () => {
    const now = clock();
    const q = new QueueManager({ now });
    q.setCooldown("video", 500);
    expect(q.available("video")).toBe(false);
    for (let i = 0; i < 10; i++) now();
    expect(q.available("video")).toBe(true);
  });
});
