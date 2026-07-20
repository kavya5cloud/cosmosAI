import { describe, it, expect } from "vitest";
import { emptyBrandDNA, evolveBrandDNA, InMemoryBrandDNAStore } from "@/lib/learning/brand-dna";
import { recordDecisionFeedback, decisionAccuracy } from "@/lib/learning/decision-feedback";
import { evolveBusinessGraph } from "@/lib/learning/business-graph-evolution";
import { aggregatePerformance } from "@/lib/learning/performance";
import type { PerformanceEvent } from "@/lib/learning/types";

describe("Brand DNA evolution", () => {
  it("evolves versions without overwriting, blending confidence", async () => {
    const store = new InMemoryBrandDNAStore();
    const v0 = emptyBrandDNA("ws1");
    const v1 = evolveBrandDNA(v0, [{ trait: "tone", value: "confident", performance: 0.8 }]);
    await store.save(v1);
    expect(v1.version).toBe(1);
    expect(v1.traits.tone.value).toBe("confident");
    expect(v1.traits.tone.confidence).toBeGreaterThan(0);

    const v2 = evolveBrandDNA(v1, [{ trait: "tone", value: "confident", performance: 0.9 }]);
    await store.save(v2);
    expect(v2.version).toBe(2);
    expect(v2.traits.tone.evidence).toBe(2);
    // prior versions preserved
    expect((await store.versions("ws1")).length).toBe(2);
    expect((await store.latest("ws1"))!.version).toBe(2);
  });

  it("is deterministic", () => {
    const v0 = emptyBrandDNA("ws");
    const a = evolveBrandDNA(v0, [{ trait: "messaging", value: "outcome-first", performance: 0.7 }]);
    const b = evolveBrandDNA(v0, [{ trait: "messaging", value: "outcome-first", performance: 0.7 }]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("Business Graph evolution", () => {
  it("emits channel/audience/campaign signals from aggregates", () => {
    const events: PerformanceEvent[] = [
      { id: "1", assetKey: "c1:linkedin_post", kind: "linkedin_post", platform: "linkedin", campaignId: "c1", audience: "founders", at: 0, metrics: { conversions: 90 } },
    ];
    const sigs = evolveBusinessGraph("ws1", aggregatePerformance(events));
    const kinds = sigs.map((s) => s.kind);
    expect(kinds).toContain("channel");
    expect(kinds).toContain("audience");
    expect(kinds).toContain("campaign_history");
    expect(sigs.every((s) => s.confidence >= 0 && s.confidence <= 1)).toBe(true);
  });
});

describe("Decision feedback loop", () => {
  it("computes deviation + quality from prediction vs actual", () => {
    const f = recordDecisionFeedback({ decisionId: "d1", channel: "seo", predictedImpact: 0.8, predictedConfidence: 0.7, actualPerformance: 0.6 });
    expect(f.deviation).toBeCloseTo(0.2, 5);
    expect(f.quality).toBeCloseTo(0.8, 5);
  });

  it("reports accuracy and an improving trend", () => {
    const feedbacks = [
      recordDecisionFeedback({ decisionId: "d1", channel: "x", predictedImpact: 0.9, predictedConfidence: 0.5, actualPerformance: 0.4, at: 1 }), // dev 0.5
      recordDecisionFeedback({ decisionId: "d2", channel: "x", predictedImpact: 0.9, predictedConfidence: 0.5, actualPerformance: 0.4, at: 2 }), // dev 0.5
      recordDecisionFeedback({ decisionId: "d3", channel: "x", predictedImpact: 0.7, predictedConfidence: 0.6, actualPerformance: 0.7, at: 3 }), // dev 0
      recordDecisionFeedback({ decisionId: "d4", channel: "x", predictedImpact: 0.7, predictedConfidence: 0.6, actualPerformance: 0.7, at: 4 }), // dev 0
    ];
    const acc = decisionAccuracy(feedbacks);
    expect(acc.samples).toBe(4);
    expect(acc.trend).toBe("improving"); // recent half better than older half
    expect(acc.meanQuality).toBeGreaterThan(0);
  });
});
