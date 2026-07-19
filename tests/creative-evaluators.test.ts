import { describe, it, expect } from "vitest";
import {
  evaluateAll, EVALUATOR_IDS,
  brandAlignment, campaignAlignment, platformSuitability,
  completeness, claimVerification, readability, originality,
} from "@/lib/creative/evaluators";
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

describe("evaluateAll", () => {
  it("runs the full panel of 8 evaluators, all in [0,1]", () => {
    const results = evaluateAll(strong, ctx);
    expect(results.length).toBe(EVALUATOR_IDS.length);
    expect(results.length).toBe(8);
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
      expect(r.recommendations.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic", () => {
    expect(JSON.stringify(evaluateAll(strong, ctx))).toBe(JSON.stringify(evaluateAll(strong, ctx)));
  });
});

describe("brandAlignment", () => {
  it("penalizes generic cliché copy", () => {
    const cliche: CreativeSubject = { kind: "linkedin_post", body: "A revolutionary, game-changing, world-class, cutting-edge, seamless solution to supercharge synergy." };
    const good = brandAlignment(strong, ctx);
    const bad = brandAlignment(cliche, ctx);
    expect(bad.score).toBeLessThan(good.score);
  });
});

describe("campaignAlignment", () => {
  it("scores higher when the CTA and key message are present", () => {
    const noCta: CreativeSubject = { kind: "linkedin_post", body: "A tool for founders about marketing that reasons well." };
    expect(campaignAlignment(strong, ctx).score).toBeGreaterThan(campaignAlignment(noCta, ctx).score);
  });
});

describe("platformSuitability", () => {
  it("flags a too-short blog and rewards a correctly-sized one", () => {
    const tiny: CreativeSubject = { kind: "blog", body: "Short blog." };
    const sized: CreativeSubject = { kind: "blog", body: Array(600).fill("word").join(" ") };
    expect(platformSuitability(tiny, ctx).score).toBeLessThan(platformSuitability(sized, ctx).score);
  });
});

describe("completeness", () => {
  it("detects a missing call to action", () => {
    const noCta: CreativeSubject = { kind: "linkedin_post", title: "Hook", body: "an AI CMO that reasons, backed by a deterministic decision engine with real numbers like 3x." };
    const r = completeness(noCta, ctx);
    expect(r.recommendations.join(" ").toLowerCase()).toContain("call to action");
  });
});

describe("claimVerification", () => {
  it("flags unsupported superlatives", () => {
    const boast: CreativeSubject = { kind: "advertisement", body: "The #1 best fastest guaranteed tool. 500% growth, always works." };
    const r = claimVerification(boast, ctx);
    expect(r.score).toBeLessThan(0.9);
    expect(r.recommendations.join(" ").toLowerCase()).toMatch(/substantiate|superlative|verify/);
  });
  it("does not penalize claim-free copy", () => {
    const plain: CreativeSubject = { kind: "linkedin_post", body: "A calm, clear tool that helps founders think about marketing." };
    expect(claimVerification(plain, ctx).score).toBeGreaterThanOrEqual(0.85);
  });
});

describe("readability + originality", () => {
  it("rewards varied prose over repetitive text", () => {
    const repetitive: CreativeSubject = { kind: "linkedin_post", body: "Marketing marketing marketing. Marketing marketing marketing. Marketing marketing marketing." };
    expect(originality(strong, ctx).score).toBeGreaterThan(originality(repetitive, ctx).score);
    expect(readability(strong, ctx).score).toBeGreaterThan(0.4);
  });
});
