import { describe, it, expect } from "vitest";
import { BusinessEventBus } from "@/lib/connectors/event-bus";
import { SyncEngine } from "@/lib/connectors/sync-engine";
import { createDefaultRegistry } from "@/lib/connectors/registry";
import { DownstreamCollector, businessEventToPerformance } from "@/lib/connectors/bridge";
import type { BusinessEvent } from "@/lib/connectors/types";

const clock = () => { let t = 0; return () => (t += 100); };

function evt(id: string, ts: number, over: Partial<BusinessEvent> = {}): BusinessEvent {
  return {
    id, tenant: "t1", connector: "stripe", timestamp: ts, source: "s", entity: "e", type: "RevenueReceived",
    payload: {}, normalizedPayload: { kind: "revenue", entity: "e", metrics: { amount: 100 }, dimensions: {}, occurredAt: ts },
    confidence: 0.9, version: 1, ...over,
  };
}

describe("Business Event Bus", () => {
  it("publishes, orders by timestamp and deduplicates by id (idempotency)", () => {
    const bus = new BusinessEventBus();
    const seen: string[] = [];
    bus.subscribe("s", (e) => seen.push(e.id));
    expect(bus.publish(evt("b", 200))).toBe(true);
    expect(bus.publish(evt("a", 100))).toBe(true);
    expect(bus.publish(evt("b", 200))).toBe(false); // duplicate id
    expect(seen).toEqual(["b", "a"]); // delivery order = publish order
    expect(bus.events().map((e) => e.id)).toEqual(["a", "b"]); // log ordered by ts
  });

  it("replays the ordered log into late subscribers", () => {
    const bus = new BusinessEventBus();
    bus.publish(evt("a", 100)); bus.publish(evt("b", 200));
    const replayed: string[] = [];
    const count = bus.replay((e) => replayed.push(e.id));
    expect(count).toBe(2);
    expect(replayed).toEqual(["a", "b"]);
  });

  it("dead-letters events a subscriber keeps failing on", () => {
    const bus = new BusinessEventBus({ maxRetries: 1 });
    bus.subscribe("flaky", () => { throw new Error("boom"); });
    bus.publish(evt("a", 100));
    expect(bus.deadLetter.length).toBe(1);
    expect(bus.deadLetter[0].subscriber).toBe("flaky");
  });
});

describe("Downstream bridge (event-driven consumers)", () => {
  it("maps performance-bearing events into Learning PerformanceEvents", () => {
    const e = evt("c", 100, { type: "CampaignPerformanceUpdated", connector: "meta_ads",
      normalizedPayload: { kind: "campaign", entity: "launch", metrics: { impressions: 1000, clicks: 50, conversions: 10 }, dimensions: {}, occurredAt: 100 } });
    const pe = businessEventToPerformance(e);
    expect(pe).not.toBeNull();
    expect(pe!.platform).toBe("facebook");
    expect(pe!.metrics.conversions).toBe(10);
    // pure revenue events are business-graph signals, not learning performance
    expect(businessEventToPerformance(evt("d", 100))).toBeNull();
  });

  it("collector subscribes to the bus and buffers batches (no direct writes)", () => {
    const bus = new BusinessEventBus();
    const collector = new DownstreamCollector().attach(bus);
    bus.publish(evt("r", 100)); // revenue → graph signal
    bus.publish(evt("c", 200, { type: "CampaignPerformanceUpdated", connector: "linkedin",
      normalizedPayload: { kind: "campaign", entity: "x", metrics: { clicks: 5, conversions: 2 }, dimensions: {}, occurredAt: 200 } }));
    expect(collector.learningBatch().length).toBe(1);
    expect(collector.graphBatch().length).toBe(1);
  });
});

describe("Sync Engine", () => {
  it("syncs a connected connector, publishes events and records the run", async () => {
    const reg = createDefaultRegistry(clock());
    const bus = new BusinessEventBus();
    const sync = new SyncEngine(reg, bus, { now: clock() });
    await reg.get("google_analytics")!.connect();
    const run = await sync.sync("google_analytics", "t1", "incremental");
    expect(run.ok).toBe(true);
    expect(run.recordsProcessed).toBeGreaterThan(0);
    expect(run.eventsPublished).toBe(run.recordsProcessed);
    expect(bus.count()).toBe(run.eventsPublished);
    expect(sync.history("google_analytics").length).toBe(1);
  });

  it("retries with backoff then records errors on persistent failure", async () => {
    const reg = createDefaultRegistry(clock());
    const bus = new BusinessEventBus();
    const sync = new SyncEngine(reg, bus, { now: clock(), maxRetries: 2 });
    await reg.get("stripe")!.connect();
    const run = await sync.sync("stripe", "t1", "incremental", { failFor: "stripe" });
    expect(run.errors).toBeGreaterThanOrEqual(2);
    // after retries clear the injected failure, the final attempt succeeds
    expect(run.ok).toBe(true);
  });

  it("syncAll only touches connected connectors and reports metrics", async () => {
    const reg = createDefaultRegistry(clock());
    const bus = new BusinessEventBus();
    const sync = new SyncEngine(reg, bus, { now: clock() });
    await reg.get("stripe")!.connect();
    await reg.get("shopify")!.connect();
    const runs = await sync.syncAll("t1");
    expect(runs.length).toBe(2);
    expect(sync.metrics().totalRuns).toBe(2);
    expect(sync.metrics().eventsPublished).toBeGreaterThan(0);
  });
});
