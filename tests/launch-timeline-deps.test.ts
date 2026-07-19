import { describe, it, expect } from "vitest";
import { createLaunch } from "@/lib/launch/engine";
import { buildTimeline, weekForStage, weekCountFor } from "@/lib/launch/timeline";
import { buildDependencyGraph, flagDependents, upstreamOf } from "@/lib/launch/dependencies";
import type { LaunchInput } from "@/lib/launch/types";

const input: LaunchInput = {
  launchType: "product_launch",
  mission: "Launch the product",
  business: { name: "Acme", audience: "founders" },
  timelineDays: 28,
};

describe("timeline", () => {
  it("spreads stages across the weeks", () => {
    expect(weekCountFor(28)).toBe(4);
    expect(weekForStage("foundation", 4)).toBe(1);
    expect(weekForStage("conversion", 4)).toBe(4);
    expect(weekForStage("distribution", 4)).toBeLessThan(weekForStage("amplification", 4));
  });

  it("places every planned asset into a week", () => {
    const plan = createLaunch(input);
    const total = plan.campaigns.reduce((n, c) => n + c.assetPlan.assets.length, 0);
    const placed = plan.weeks.reduce((n, w) => n + w.items.length, 0);
    expect(placed).toBe(total);
    // week 1 carries foundation work
    expect(plan.weeks[0].items.some((i) => i.stage === "foundation")).toBe(true);
  });

  it("is deterministic", () => {
    const plan = createLaunch(input);
    expect(JSON.stringify(buildTimeline(plan.campaigns, 28))).toBe(JSON.stringify(buildTimeline(plan.campaigns, 28)));
  });
});

describe("dependency graph", () => {
  const plan = createLaunch(input);
  const g = plan.dependencies;

  it("links every planned asset into the graph with roots + depths", () => {
    const total = plan.campaigns.reduce((n, c) => n + c.assetPlan.assets.length, 0);
    expect(g.nodes.length).toBe(total);
    expect(g.roots.length).toBeGreaterThan(0);
    // roots are depth 0
    for (const r of g.roots) expect(g.byKey[r].depth).toBe(0);
  });

  it("flags all downstream assets when an upstream changes (Part 4)", () => {
    // find a node with dependents
    const upstream = g.nodes.find((n) => n.dependents.length > 0);
    expect(upstream).toBeDefined();
    const flagged = flagDependents(g, upstream!.key);
    expect(flagged.length).toBeGreaterThan(0);
    // every flagged asset really descends from the changed one
    for (const f of flagged) expect(upstreamOf(g, f)).toContain(upstream!.key);
  });

  it("has no self-dependencies and no dangling edges", () => {
    for (const e of g.edges) {
      expect(e.from).not.toBe(e.to);
      expect(g.byKey[e.from]).toBeDefined();
      expect(g.byKey[e.to]).toBeDefined();
    }
  });

  it("is deterministic", () => {
    expect(JSON.stringify(buildDependencyGraph(plan.campaigns))).toBe(JSON.stringify(buildDependencyGraph(plan.campaigns)));
  });
});
