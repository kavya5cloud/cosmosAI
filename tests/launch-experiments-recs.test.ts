import { describe, it, expect } from "vitest";
import { createExperiment, recordResult, decideWinner, runExperiment, EXPERIMENT_TYPES } from "@/lib/launch/experiments";
import { analyzeLaunch } from "@/lib/launch/recommendations";
import { createLaunch } from "@/lib/launch/engine";
import type { LaunchInput } from "@/lib/launch/types";

describe("experiment engine", () => {
  const base = createExperiment({
    id: "exp1", type: "ab_headline", hypothesis: "Benefit beats feature.",
    variants: [{ id: "A", label: "control" }, { id: "B", label: "challenger" }],
  });

  it("requires at least two variants", () => {
    expect(() => createExperiment({ id: "x", type: "cta", hypothesis: "h", variants: [{ id: "A", label: "a" }] })).toThrow();
  });

  it("records results immutably", () => {
    const withA = recordResult(base, "A", 10);
    expect(withA).not.toBe(base);
    expect(withA.variants.find((v) => v.id === "A")!.metric).toBe(10);
    expect(base.variants.find((v) => v.id === "A")!.metric).toBeUndefined();
  });

  it("picks the highest-metric variant as winner with margin-based confidence", () => {
    const decided = runExperiment(base, [{ variantId: "A", metric: 40 }, { variantId: "B", metric: 60 }]);
    expect(decided.winnerVariantId).toBe("B");
    expect(decided.confidence).toBeCloseTo(0.2, 5); // |60-40|/100
    expect(decided.performance).toEqual({ A: 40, B: 60 });
  });

  it("declares no winner when the margin is below the confidence floor", () => {
    const decided = runExperiment(base, [{ variantId: "A", metric: 100 }, { variantId: "B", metric: 100 }], { minConfidence: 0.05 });
    expect(decided.winnerVariantId).toBeNull();
  });

  it("is deterministic", () => {
    const a = runExperiment(base, [{ variantId: "A", metric: 30 }, { variantId: "B", metric: 70 }]);
    const b = runExperiment(base, [{ variantId: "A", metric: 30 }, { variantId: "B", metric: 70 }]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(EXPERIMENT_TYPES.length).toBe(6);
  });

  it("decideWinner is a no-op without enough scored variants", () => {
    expect(decideWinner(recordResult(base, "A", 5)).winnerVariantId).toBeNull();
  });
});

describe("smart recommendations", () => {
  const input: LaunchInput = {
    launchType: "product_launch", mission: "Launch it",
    business: { name: "Acme", audience: "founders" }, timelineDays: 10,
  };

  it("returns evidence-backed recommendations sorted by severity", () => {
    const plan = createLaunch(input);
    const recs = analyzeLaunch(plan);
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(r.evidence.length).toBeGreaterThan(0);
      expect(r.suggestedAction).toBeTruthy();
    }
    // high severity first
    const sev = recs.map((r) => r.severity);
    const rank = { high: 0, medium: 1, low: 2 } as const;
    for (let i = 1; i < sev.length; i++) expect(rank[sev[i]]).toBeGreaterThanOrEqual(rank[sev[i - 1]]);
  });

  it("flags a compressed timeline as a publishing delay", () => {
    const recs = analyzeLaunch(createLaunch(input));
    expect(recs.some((r) => r.type === "publishing_delay")).toBe(true);
  });

  it("flags low-confidence assets from generation signals", () => {
    const plan = createLaunch(input);
    const key = `${plan.campaigns[0].id}:${plan.campaigns[0].assetPlan.assets[0].kind}`;
    const recs = analyzeLaunch(plan, { generatedScores: { [key]: 0.4 } });
    expect(recs.some((r) => r.type === "low_confidence_asset" && r.severity === "high")).toBe(true);
  });

  it("is deterministic", () => {
    const plan = createLaunch(input);
    expect(JSON.stringify(analyzeLaunch(plan))).toBe(JSON.stringify(analyzeLaunch(plan)));
  });
});
