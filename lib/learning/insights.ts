import type {
  AssetAggregate, BrandDNA, DecisionAccuracy, LearningInsight, Pattern,
} from "./types";
import { round } from "./util";

// Insight generation (Parts 1 & 8) — turns the structured intelligence into a ranked,
// human-readable feed. Deterministic: pure function of the learned state.

export function generateInsights(input: {
  aggregates: AssetAggregate[];
  patterns: Pattern[];
  brand?: BrandDNA | null;
  accuracy?: DecisionAccuracy | null;
}): LearningInsight[] {
  const out: LearningInsight[] = [];
  const { aggregates, patterns, brand, accuracy } = input;

  // Top pattern
  const top = patterns[0];
  if (top) out.push({
    kind: "top_pattern",
    title: `Top pattern: ${top.kind.replace(/_/g, " ")}`,
    detail: `"${top.label}" performs at ${round(top.performance)} (confidence ${round(top.confidence)}).`,
    confidence: top.confidence,
    evidence: [`platform ${top.platform ?? "n/a"}`, `audience ${top.audience ?? "any"}`],
  });

  // Winning hook
  const hook = patterns.find((p) => p.kind === "winning_hook");
  if (hook) out.push({
    kind: "winning_hook",
    title: "Winning hook style",
    detail: `${hook.label} is winning at ${round(hook.performance)}.`,
    confidence: hook.confidence, evidence: [hook.value],
  });

  // Winning asset (best aggregate)
  const best = aggregates[0];
  if (best) out.push({
    kind: "winning_asset",
    title: `Best asset: ${best.kind ?? best.assetKey}`,
    detail: `Scored ${round(best.score)} across ${best.eventCount} events on ${best.platform}.`,
    confidence: best.score, evidence: [best.assetKey],
  });

  // Channel signal
  const byPlatform = new Map<string, number[]>();
  for (const a of aggregates) (byPlatform.get(a.platform) ?? byPlatform.set(a.platform, []).get(a.platform)!).push(a.score);
  const channelRanked = [...byPlatform.entries()]
    .map(([p, xs]) => ({ p, mean: xs.reduce((s, x) => s + x, 0) / xs.length }))
    .sort((a, b) => b.mean - a.mean);
  if (channelRanked[0]) out.push({
    kind: "channel_signal",
    title: `${channelRanked[0].p} is the strongest channel`,
    detail: `Mean performance ${round(channelRanked[0].mean)}${channelRanked[1] ? `, ahead of ${channelRanked[1].p} (${round(channelRanked[1].mean)})` : ""}.`,
    confidence: round(channelRanked[0].mean), evidence: channelRanked.slice(0, 3).map((c) => `${c.p}:${round(c.mean)}`),
  });

  // Brand shift
  if (brand && brand.version > 0) {
    const strongest = Object.entries(brand.traits).sort((a, b) => b[1].confidence - a[1].confidence)[0];
    if (strongest && strongest[1].confidence > 0) out.push({
      kind: "brand_shift",
      title: `Brand DNA v${brand.version}`,
      detail: `Strongest trait: ${strongest[0].replace(/_/g, " ")} → "${strongest[1].value}" (confidence ${round(strongest[1].confidence)}).`,
      confidence: strongest[1].confidence, evidence: [`version ${brand.version}`],
    });
  }

  // Decision accuracy
  if (accuracy && accuracy.samples > 0) out.push({
    kind: "decision_accuracy",
    title: `Planner accuracy ${round(accuracy.meanQuality * 100)}%`,
    detail: `Across ${accuracy.samples} decisions, mean deviation ${round(accuracy.meanDeviation)} and ${accuracy.trend}.`,
    confidence: accuracy.meanQuality, evidence: [`trend ${accuracy.trend}`],
  });

  // Recommendation (deterministic, evidence-backed)
  if (channelRanked[0]) out.push({
    kind: "recommendation",
    title: `Double down on ${channelRanked[0].p}`,
    detail: `It's your highest-performing channel${top ? ` and "${top.label}" is the pattern to repeat` : ""}.`,
    confidence: round(channelRanked[0].mean), evidence: [`${channelRanked[0].p} leads`],
  });

  return out;
}
