import { describe, it, expect } from "vitest";
import { runCouncil, runReviewers, REVIEWER_IDS } from "@/lib/creative/council";
import { evaluateAll } from "@/lib/creative/evaluators";
import type { CreativeSubject, EvaluationContext } from "@/lib/creative/types";

const ctx: EvaluationContext = {
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
  mission: "Launch Populr",
  campaign: { goal: "launch_product", title: "Launch Populr", channels: ["linkedin"] },
  knownFacts: ["deterministic decision engine"],
};

const strong: CreativeSubject = {
  kind: "linkedin_post",
  channel: "linkedin",
  title: "The AI CMO that reasons",
  body:
    "Most founders drown in marketing busywork. Populr is an AI CMO that reasons about what actually moves your numbers. " +
    "It plans the campaign, drafts the assets, and measures what worked, so founders spend time only on what matters. " +
    "Built on a deterministic decision engine, it explains every call in plain language. Join early access to try it.",
};

const weak: CreativeSubject = {
  kind: "blog",
  body: "Revolutionary game-changing world-class synergy. #1 best fastest guaranteed. Buy now buy now buy now.",
};

describe("runReviewers", () => {
  it("returns all six reviewers with well-formed results", () => {
    const panel = evaluateAll(strong, ctx);
    const reviews = runReviewers(panel);
    expect(reviews.map((r) => r.reviewer).sort()).toEqual([...REVIEWER_IDS].sort());
    for (const r of reviews) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
      expect(Array.isArray(r.issues)).toBe(true);
      expect(Array.isArray(r.suggestions)).toBe(true);
    }
  });
});

describe("runCouncil", () => {
  it("returns a verdict, score, reviews, evaluations and reasoning", () => {
    const d = runCouncil(strong, ctx);
    expect(["APPROVED", "REVISION_REQUIRED", "REJECTED"]).toContain(d.verdict);
    expect(d.reviews.length).toBe(6);
    expect(d.evaluations.length).toBe(8);
    expect(d.reasoning.length).toBeGreaterThan(0);
    expect(d.score).toBeGreaterThanOrEqual(0);
    expect(d.score).toBeLessThanOrEqual(1);
  });

  it("scores a strong, on-brief asset higher than a weak, cliché one", () => {
    const good = runCouncil(strong, ctx);
    const bad = runCouncil(weak, ctx);
    expect(good.score).toBeGreaterThan(bad.score);
  });

  it("approves a strong, on-brief asset (no self-contradictory reject at a high score)", () => {
    const good = runCouncil(strong, ctx);
    expect(good.verdict).toBe("APPROVED");
    expect(good.blockingIssues.length).toBe(0);
  });

  it("does not APPROVE the weak asset, and flags blocking issues", () => {
    const bad = runCouncil(weak, ctx);
    expect(bad.verdict).not.toBe("APPROVED");
    expect(bad.blockingIssues.length).toBeGreaterThan(0);
    expect(bad.blockingIssues.every((i) => i.severity === "high")).toBe(true);
  });

  it("rejects empty content outright", () => {
    const empty = runCouncil({ kind: "linkedin_post", body: "." }, ctx);
    expect(empty.verdict).toBe("REJECTED");
  });

  it("is deterministic", () => {
    expect(JSON.stringify(runCouncil(strong, ctx))).toBe(JSON.stringify(runCouncil(strong, ctx)));
  });
});
