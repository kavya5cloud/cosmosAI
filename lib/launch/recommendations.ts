import type { AssetKind } from "@/lib/creative/taxonomy";
import { getTemplate } from "@/lib/launch/templates";
import type { LaunchPlan, LaunchRecommendation } from "@/lib/launch/types";

// Smart Recommendations — the Decision Planner's proactive layer for a launch. Every
// recommendation is evidence-backed (it cites concrete facts from the plan). Deterministic:
// same plan + signals → same recommendations.

export type LaunchSignals = {
  /** Council/quality scores for produced assets, keyed by assetKey (0..1). */
  generatedScores?: Record<string, number>;
  /** Asset keys whose publishing is behind schedule. */
  delayedAssetKeys?: string[];
};

// A canonical channel set a healthy launch should touch; missing ones are flagged.
const CANONICAL_CHANNELS = ["articles", "linkedin", "x", "email", "instagram"];
// Foundational kinds most launches should include.
const EXPECTED_FOUNDATION: AssetKind[] = ["landing_hero", "hero_video"];
const WEAK_CAMPAIGN_ASSETS = 4;
const HIGH_VALUE_KINDS: AssetKind[] = ["landing_hero", "hero_video", "email", "advertisement"];

export function analyzeLaunch(plan: LaunchPlan, signals: LaunchSignals = {}): LaunchRecommendation[] {
  const recs: LaunchRecommendation[] = [];
  const template = getTemplate(plan.launchType);
  const presentKinds = new Set<AssetKind>(plan.campaigns.flatMap((c) => c.assetPlan.assets.map((a) => a.kind)));
  const allKeys = plan.campaigns.flatMap((c) => c.assetPlan.assets.map((a) => `${c.id}:${a.kind}`));

  // 1) Missing foundational assets.
  for (const kind of EXPECTED_FOUNDATION) {
    if (!presentKinds.has(kind)) {
      recs.push({
        type: "missing_asset", severity: kind === "landing_hero" ? "high" : "medium",
        message: `No ${kind.replace(/_/g, " ")} in the plan.`,
        evidence: [`${template.label} launches convert better with a ${kind.replace(/_/g, " ")}.`, `Present kinds: ${[...presentKinds].join(", ")}.`],
        suggestedAction: `Add a ${kind.replace(/_/g, " ")} to the foundation phase.`,
      });
    }
  }

  // 2) Weak campaigns (too few assets to sustain a channel).
  for (const c of plan.campaigns) {
    if (c.assetPlan.summary.total < WEAK_CAMPAIGN_ASSETS) {
      recs.push({
        type: "weak_campaign", severity: "medium",
        message: `Campaign "${c.title}" has only ${c.assetPlan.summary.total} asset(s).`,
        evidence: [`Goal: ${c.goal}.`, `Channels: ${c.channels.join(", ")}.`],
        suggestedAction: "Add distribution + amplification assets so the campaign can sustain a cadence.",
      });
    }
  }

  // 3) Missed channels vs the canonical set.
  const covered = new Set(plan.summary.channels);
  const missed = CANONICAL_CHANNELS.filter((ch) => !covered.has(ch));
  if (missed.length) {
    recs.push({
      type: "missed_channel", severity: missed.includes("email") ? "high" : "medium",
      message: `Missing ${missed.length} channel(s): ${missed.join(", ")}.`,
      evidence: [`Covered channels: ${[...covered].join(", ") || "none"}.`],
      suggestedAction: `Add a campaign or assets for: ${missed.join(", ")}.`,
    });
  }

  // 4) Publishing delays (compressed timeline or explicitly-delayed assets).
  if (plan.timelineDays < template.defaultTimelineDays) {
    recs.push({
      type: "publishing_delay", severity: "medium",
      message: `Timeline is compressed to ${plan.timelineDays}d (recommended ${template.defaultTimelineDays}d).`,
      evidence: [`${plan.summary.assetCount} assets across ${plan.summary.weekCount} weeks.`],
      suggestedAction: "Stagger amplification assets into a fast-follow week to protect quality.",
    });
  }
  for (const key of signals.delayedAssetKeys ?? []) {
    if (allKeys.includes(key)) {
      recs.push({
        type: "publishing_delay", severity: "high",
        message: `Asset ${key} is behind its publishing slot.`,
        evidence: ["Reported by the publishing pipeline."],
        suggestedAction: "Escalate review/approval or reschedule dependent assets.",
      });
    }
  }

  // 5) Low-confidence assets (from produced-asset scores, if available).
  for (const [key, score] of Object.entries(signals.generatedScores ?? {})) {
    if (score < 0.7 && allKeys.includes(key)) {
      recs.push({
        type: "low_confidence_asset", severity: score < 0.5 ? "high" : "medium",
        message: `Asset ${key} scored ${Math.round(score * 100)}% with the Creative Director.`,
        evidence: [`Below the 70% approval bar.`],
        suggestedAction: "Regenerate or edit before publishing.",
      });
    }
  }

  // 6) Experiment opportunities on high-value assets not yet tested.
  const testedKeys = new Set(plan.experiments.map((e) => e.assetKey).filter(Boolean) as string[]);
  for (const c of plan.campaigns) {
    for (const a of c.assetPlan.assets) {
      const key = `${c.id}:${a.kind}`;
      if (HIGH_VALUE_KINDS.includes(a.kind) && !testedKeys.has(key)) {
        recs.push({
          type: "experiment_opportunity", severity: "low",
          message: `${a.label} in "${c.title}" isn't being A/B tested.`,
          evidence: [`High-value ${a.kind.replace(/_/g, " ")} on ${a.channel}.`],
          suggestedAction: `Add an experiment (e.g. ${a.kind === "hero_video" ? "thumbnail" : "headline/CTA"}) for this asset.`,
        });
        break; // one experiment nudge per campaign is enough
      }
    }
  }

  const rank = { high: 0, medium: 1, low: 2 } as const;
  return recs.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
