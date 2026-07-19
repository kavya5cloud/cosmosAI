import { describe, it, expect } from "vitest";
import type { CampaignRow } from "@/lib/services/campaigns";
import {
  campaignToPlannerInput, normalizeBrief, normalizePlannerInput, normalizeSubject,
  runCreativePipeline,
} from "@/lib/creative/pipeline";

// Integration: the deterministic path from a persisted Campaign row through
// Planner → Director → Council, without any DB or LLM.

const row: CampaignRow = {
  id: "11111111-1111-1111-1111-111111111111",
  goal: "launch_product",
  title: "Launch Populr",
  brief: {
    objective: "Launch to founders",
    audience: "founders",
    keyMessage: "an AI CMO that reasons",
    emotionalAngle: "calm confidence",
    proof: "deterministic decision engine",
    cta: "join early access",
    visualDirection: "clean minimal",
    successMetric: "signups",
  },
  channels: ["articles", "linkedin", "x"],
  timeline_days: 30,
  priority: 2,
  expected_impact: "more signups",
  reasoning: "articles compound and feed distribution",
  tasks: [],
  status: "active",
  created_at: "2026-07-19",
  done_tasks: [],
};

describe("campaignToPlannerInput", () => {
  it("maps a campaign row into a full planner input", () => {
    const input = campaignToPlannerInput(row);
    expect(input.campaign.goal).toBe("launch_product");
    expect(input.brief.keyMessage).toBe("an AI CMO that reasons");
    expect(input.campaign.channels).toContain("linkedin");
  });
});

describe("normalizeBrief", () => {
  it("fills every brief field even from a partial object", () => {
    const b = normalizeBrief({ objective: "x" });
    expect(b.objective).toBe("x");
    expect(b.cta).toBe("");
    expect(Object.keys(b).length).toBe(8);
  });
});

describe("normalizePlannerInput / normalizeSubject", () => {
  it("requires at least a goal or title", () => {
    expect(normalizePlannerInput({})).toBeNull();
    expect(normalizePlannerInput({ campaign: { goal: "leads" } })).not.toBeNull();
  });
  it("rejects a subject without a valid kind + body", () => {
    expect(normalizeSubject({ body: "hi" })).toBeNull();
    expect(normalizeSubject({ kind: "not_a_kind", body: "hi there" })).toBeNull();
    expect(normalizeSubject({ kind: "linkedin_post", body: "hi there" })).not.toBeNull();
  });
});

describe("runCreativePipeline", () => {
  it("plans assets and returns a council decision for a subject", () => {
    const input = campaignToPlannerInput(row);
    const { plan, decision } = runCreativePipeline(input, {
      kind: "linkedin_post",
      body:
        "Populr is an AI CMO that reasons about what moves your numbers for founders. It plans, drafts and measures, " +
        "built on a deterministic decision engine. Join early access to try it.",
    });
    expect(plan.assets.length).toBeGreaterThan(0);
    expect(["APPROVED", "REVISION_REQUIRED", "REJECTED"]).toContain(decision.verdict);
    expect(decision.evaluations.length).toBe(8);
  });

  it("is deterministic end-to-end", () => {
    const input = campaignToPlannerInput(row);
    const subject = { kind: "email" as const, body: "Join early access to the AI CMO that reasons, for founders. Deterministic decision engine inside." };
    expect(JSON.stringify(runCreativePipeline(input, subject))).toBe(JSON.stringify(runCreativePipeline(input, subject)));
  });
});
