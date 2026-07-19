import { describe, it, expect } from "vitest";
import { createLaunch } from "@/lib/launch/engine";
import { LAUNCH_TEMPLATE_IDS, getTemplate } from "@/lib/launch/templates";
import type { LaunchInput } from "@/lib/launch/types";

function input(overrides: Partial<LaunchInput> = {}): LaunchInput {
  return {
    launchType: "ai_tool_launch",
    mission: "Launch Populr, the AI CMO",
    business: { name: "Populr", audience: "founders", oneLiner: "an AI CMO that reasons" },
    ...overrides,
  };
}

describe("createLaunch", () => {
  it("produces a complete LaunchPlan with every required section", () => {
    const plan = createLaunch(input());
    expect(plan.launchId).toMatch(/^launch_/);
    expect(plan.objectives.length).toBeGreaterThan(0);
    expect(plan.campaigns.length).toBeGreaterThan(0);
    expect(plan.weeks.length).toBeGreaterThan(0);
    expect(plan.dependencies.nodes.length).toBeGreaterThan(0);
    expect(plan.publishingSchedule.length).toBeGreaterThan(0);
    expect(plan.kpis.length).toBeGreaterThan(0);
    expect(plan.experiments.length).toBeGreaterThan(0);
    expect(plan.summary.assetCount).toBeGreaterThan(0);
  });

  it("builds each campaign with a brief and a full asset plan", () => {
    const plan = createLaunch(input());
    for (const c of plan.campaigns) {
      expect(c.brief.audience).toBeTruthy();
      expect(c.assetPlan.assets.length).toBeGreaterThan(0);
      expect(c.budgetShare).toBeGreaterThan(0);
    }
    // budget shares sum to ~1
    const total = plan.campaigns.reduce((n, c) => n + c.budgetShare, 0);
    expect(Math.abs(total - 1)).toBeLessThan(0.05);
  });

  it("is deterministic — same input yields an identical plan", () => {
    expect(JSON.stringify(createLaunch(input()))).toBe(JSON.stringify(createLaunch(input())));
    expect(createLaunch(input()).launchId).toBe(createLaunch(input()).launchId);
  });

  it("honors a custom timeline and flags the compression as a risk", () => {
    const plan = createLaunch(input({ timelineDays: 10 }));
    expect(plan.timelineDays).toBe(10);
    expect(plan.risks.some((r) => r.id === "timeline_compression")).toBe(true);
  });

  it("every template produces a valid plan", () => {
    for (const id of LAUNCH_TEMPLATE_IDS) {
      const plan = createLaunch(input({ launchType: id }));
      expect(plan.campaigns.length).toBe(getTemplate(id).campaigns.length);
      expect(plan.summary.assetCount).toBeGreaterThan(0);
    }
  });

  it("derives objectives and KPIs from the template", () => {
    const plan = createLaunch(input());
    const tpl = getTemplate("ai_tool_launch");
    expect(plan.objectives.map((o) => o.statement)).toEqual(tpl.objectives);
    expect(plan.kpis).toEqual(tpl.kpis);
  });
});
