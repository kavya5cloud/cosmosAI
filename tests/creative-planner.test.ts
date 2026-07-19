import { describe, it, expect } from "vitest";
import { planAssets } from "@/lib/creative/asset-planner";
import type { PlannerInput } from "@/lib/creative/types";

const brief = {
  objective: "Launch the product to founders",
  audience: "seed-stage founders",
  keyMessage: "An AI CMO that reasons",
  emotionalAngle: "calm confidence",
  proof: "deterministic decision engine",
  cta: "join early access",
  visualDirection: "clean minimal",
  successMetric: "signups",
};

function input(overrides: Partial<PlannerInput> = {}): PlannerInput {
  return {
    mission: "Launch Populr",
    campaign: { goal: "launch_product", title: "Launch Populr", channels: ["articles", "linkedin", "x"] },
    brief,
    ...overrides,
  };
}

describe("planAssets", () => {
  it("produces the full launch sequence for launch_product", () => {
    const plan = planAssets(input());
    const kinds = plan.assets.map((a) => a.kind);
    expect(kinds).toContain("hero_video");
    expect(kinds).toContain("product_demo");
    expect(kinds).toContain("ugc_video");
    expect(kinds).toContain("landing_hero");
    expect(kinds).toContain("email");
    expect(kinds).toContain("press_release");
    expect(kinds).toContain("sales_deck");
  });

  it("keeps the template order (hero first, conversion last) with 1-based order", () => {
    const plan = planAssets(input());
    expect(plan.assets[0].kind).toBe("hero_video");
    expect(plan.assets[0].order).toBe(1);
    const last = plan.assets[plan.assets.length - 1];
    expect(last.stage).toBe("conversion");
    // order is strictly increasing
    for (let i = 1; i < plan.assets.length; i++) expect(plan.assets[i].order).toBe(plan.assets[i - 1].order + 1);
  });

  it("counts multi-quantity assets (3 UGC videos)", () => {
    const plan = planAssets(input());
    const ugc = plan.assets.find((a) => a.kind === "ugc_video")!;
    expect(ugc.quantity).toBe(3);
    expect(plan.summary.byStage.amplification).toBeGreaterThanOrEqual(3);
    // total counts quantities, not just rows
    expect(plan.summary.total).toBeGreaterThan(plan.assets.length);
  });

  it("wires derivation dependencies (nothing orphaned except the root)", () => {
    const plan = planAssets(input());
    const keys = new Set(plan.assets.map((a) => a.key));
    const roots = plan.assets.filter((a) => a.dependsOn.length === 0);
    expect(roots.length).toBe(1); // exactly one root
    expect(roots[0].stage).toBe("foundation");
    for (const a of plan.assets) for (const d of a.dependsOn) expect(keys.has(d)).toBe(true);
  });

  it("adds a distribution asset for a channel not covered by the template", () => {
    const plan = planAssets(input({ campaign: { goal: "launch_product", title: "x", channels: ["reddit"] } }));
    const kinds = plan.assets.map((a) => a.kind);
    expect(kinds).toContain("reddit_post");
    // channel extra is inserted before the conversion assets
    const reddit = plan.assets.find((a) => a.kind === "reddit_post")!;
    const firstConversion = plan.assets.find((a) => a.stage === "conversion")!;
    expect(reddit.order).toBeLessThan(firstConversion.order);
  });

  it("uses a different template per goal", () => {
    const seo = planAssets(input({ campaign: { goal: "grow_seo", title: "SEO", channels: [] } }));
    expect(seo.assets.filter((a) => a.kind === "blog").length).toBeGreaterThanOrEqual(1);
    expect(seo.assets.some((a) => a.kind === "hero_video")).toBe(false);
  });

  it("falls back to the default template for an unknown goal", () => {
    const plan = planAssets(input({ campaign: { goal: "totally_unknown", title: "X", channels: [] } }));
    expect(plan.assets.length).toBeGreaterThanOrEqual(3);
  });

  it("is deterministic — same input yields an identical plan", () => {
    const a = planAssets(input());
    const b = planAssets(input());
    expect(a.planId).toBe(b.planId);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
