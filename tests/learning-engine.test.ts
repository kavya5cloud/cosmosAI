import { describe, it, expect } from "vitest";
import { LearningEngine } from "@/lib/learning/engine";
import { normalizePerformanceEvent } from "@/lib/learning/performance";
import type { PerformanceEvent } from "@/lib/learning/types";

const events: PerformanceEvent[] = [
  normalizePerformanceEvent({ assetKey: "c1:hero_video", kind: "hero_video", platform: "youtube", campaignId: "c1", audience: "founders", at: Date.UTC(2026, 0, 1, 10), metrics: { conversions: 150, revenue: 3000, watch_time: 90 } }),
  normalizePerformanceEvent({ assetKey: "c1:linkedin_post", kind: "linkedin_post", platform: "linkedin", campaignId: "c1", audience: "founders", at: Date.UTC(2026, 0, 2, 9), metrics: { conversions: 60, shares: 40 } }),
  normalizePerformanceEvent({ assetKey: "c1:email", kind: "email", platform: "email", campaignId: "c1", at: 0, metrics: { email_opens: 5 } }),
];

describe("Learning Engine (orchestration)", () => {
  it("processes events and updates every intelligence store", async () => {
    const engine = new LearningEngine();
    const result = await engine.ingest(events, { workspaceKey: "ws1" });

    expect(result.processedEvents).toBe(3);
    expect(result.aggregates.length).toBe(3);
    expect(result.patterns.length).toBeGreaterThan(0);
    expect(result.memoryUpdates).toBeGreaterThan(0);
    expect(result.brandVersion).toBeGreaterThanOrEqual(1);
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.insights.length).toBeGreaterThan(0);

    // Creative Memory (the existing M8 store) received winning + underperforming entries
    const winning = await engine.memory.search({}, 20);
    expect(winning.length).toBeGreaterThan(0);
  });

  it("feeds the Pattern Library and Brand DNA stores", async () => {
    const engine = new LearningEngine();
    await engine.ingest(events, { workspaceKey: "ws1" });
    const snap = await engine.snapshot("ws1");
    expect(snap.patternCount).toBeGreaterThan(0);
    expect(snap.brandVersion).toBeGreaterThanOrEqual(1);
    expect(snap.topPattern).not.toBeNull();
  });

  it("gets smarter across runs (patterns accumulate + version up)", async () => {
    const engine = new LearningEngine();
    const r1 = await engine.ingest(events, { workspaceKey: "ws1" });
    const r2 = await engine.ingest(events, { workspaceKey: "ws1" });
    // same patterns re-observed → their versions increased
    expect(r2.patterns.some((p) => p.version > 1)).toBe(true);
    // brand DNA advanced a version
    expect((r2.brandVersion ?? 0)).toBeGreaterThan(r1.brandVersion ?? 0);
  });

  it("is deterministic for the same events", async () => {
    const a = await new LearningEngine().ingest(events, { workspaceKey: "ws1" });
    const b = await new LearningEngine().ingest(events, { workspaceKey: "ws1" });
    expect(JSON.stringify(a.aggregates)).toBe(JSON.stringify(b.aggregates));
    expect(JSON.stringify(a.insights)).toBe(JSON.stringify(b.insights));
  });
});
