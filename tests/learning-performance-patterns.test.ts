import { describe, it, expect } from "vitest";
import { normalizePerformanceEvent, performanceScore, aggregatePerformance } from "@/lib/learning/performance";
import { extractPatterns, searchPatterns, InMemoryPatternStore } from "@/lib/learning/patterns";
import type { PerformanceEvent } from "@/lib/learning/types";

describe("Performance ingestion (unified schema)", () => {
  it("maps platform aliases into the canonical schema", () => {
    const e = normalizePerformanceEvent({
      assetKey: "c1:linkedin_post", platform: "linkedin",
      metrics: { impressions: 1000, reactions: 50, reposts: 10, sales: 200 },
    });
    expect(e.metrics.reach).toBe(1000);
    expect(e.metrics.likes).toBe(50);
    expect(e.metrics.shares).toBe(10);
    expect(e.metrics.revenue).toBe(200);
  });

  it("scores deterministically and rewards conversions/revenue over reach", () => {
    const convHeavy = performanceScore({ conversions: 100, revenue: 1000 });
    const reachHeavy = performanceScore({ reach: 100000, views: 100000 });
    expect(convHeavy).toBeGreaterThan(reachHeavy);
    expect(performanceScore({})).toBe(0);
    expect(performanceScore({ conversions: 100 })).toBe(performanceScore({ conversions: 100 }));
  });

  it("aggregates events per asset and picks the best posting hour", () => {
    const events: PerformanceEvent[] = [
      { id: "1", assetKey: "a", kind: "linkedin_post", platform: "linkedin", at: Date.UTC(2026, 0, 1, 9), metrics: { conversions: 80 } },
      { id: "2", assetKey: "a", kind: "linkedin_post", platform: "linkedin", at: Date.UTC(2026, 0, 2, 18), metrics: { conversions: 10 } },
    ];
    const [agg] = aggregatePerformance(events);
    expect(agg.eventCount).toBe(2);
    expect(agg.totals.conversions).toBe(90);
    expect(agg.bestHour).toBe(9); // the 9:00 event scored higher
  });
});

describe("Pattern Library", () => {
  const events: PerformanceEvent[] = [
    { id: "1", assetKey: "c1:hero_video", kind: "hero_video", platform: "youtube", at: Date.UTC(2026, 0, 1, 10), audience: "founders", metrics: { conversions: 120, revenue: 2000, watch_time: 60 } },
    { id: "2", assetKey: "c1:email", kind: "email", platform: "email", at: 0, metrics: { views: 3 } },
  ];

  it("extracts winning patterns from high-performing assets only", () => {
    const aggs = aggregatePerformance(events);
    const patterns = extractPatterns(aggs);
    const kinds = patterns.map((p) => p.kind);
    expect(kinds).toContain("winning_video_structure");
    expect(kinds).toContain("winning_posting_time");
    // the low-scoring email should not become a winning pattern
    expect(patterns.some((p) => p.kind === "winning_cta")).toBe(false);
  });

  it("stores, versions and searches patterns", async () => {
    const store = new InMemoryPatternStore();
    const patterns = extractPatterns(aggregatePerformance(events));
    for (const p of patterns) await store.record(p);
    const first = patterns[0];
    const re = await store.record(first); // same id → version bump
    expect(re.version).toBe(2);
    expect((await store.search({ kind: "winning_video_structure" })).length).toBeGreaterThan(0);
  });

  it("search filters and is deterministic", () => {
    const patterns = extractPatterns(aggregatePerformance(events));
    expect(JSON.stringify(searchPatterns(patterns, { platform: "youtube" })))
      .toBe(JSON.stringify(searchPatterns(patterns, { platform: "youtube" })));
  });
});
