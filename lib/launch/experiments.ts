import type { ExperimentSpec, ExperimentType, ExperimentVariant } from "@/lib/launch/types";

// Experiment Engine — A/B and variant tests attached to launch assets. Deterministic:
// the winner is chosen purely from recorded metrics, and confidence is a stable function
// of the margin between the best and second-best variant. No stats library, no randomness.

export const EXPERIMENT_TYPES: ExperimentType[] = [
  "ab_headline", "ab_hook", "thumbnail", "cta", "caption", "creative_variant",
];

export function createExperiment(input: {
  id: string;
  type: ExperimentType;
  hypothesis: string;
  variants: { id: string; label: string }[];
  assetKey?: string | null;
}): ExperimentSpec {
  if (input.variants.length < 2) throw new Error("experiment_needs_2_variants");
  return {
    id: input.id, type: input.type, assetKey: input.assetKey ?? null,
    hypothesis: input.hypothesis,
    variants: input.variants.map((v) => ({ id: v.id, label: v.label })),
    winnerVariantId: null, confidence: null, performance: null,
  };
}

/** Record a metric for a variant (higher = better). Returns a new spec (immutable). */
export function recordResult(exp: ExperimentSpec, variantId: string, metric: number): ExperimentSpec {
  const variants: ExperimentVariant[] = exp.variants.map((v) => (v.id === variantId ? { ...v, metric } : v));
  return { ...exp, variants };
}

/**
 * Decide the winner from recorded metrics. Winner = highest metric. Confidence is the
 * normalized margin over the runner-up (0..1), so a clear win reads as high confidence.
 */
export function decideWinner(exp: ExperimentSpec, opts: { minConfidence?: number } = {}): ExperimentSpec {
  const scored = exp.variants.filter((v) => typeof v.metric === "number") as Required<ExperimentVariant>[];
  if (scored.length < 2) return { ...exp, winnerVariantId: null, confidence: null };

  const sorted = [...scored].sort((a, b) => b.metric - a.metric);
  const [best, second] = sorted;
  const total = best.metric + second.metric;
  const confidence = total > 0 ? Math.round((Math.abs(best.metric - second.metric) / total) * 100) / 100 : 0;

  const performance = Object.fromEntries(scored.map((v) => [v.id, v.metric]));
  const min = opts.minConfidence ?? 0.05;
  const decided = confidence >= min && best.metric > second.metric;
  return {
    ...exp,
    winnerVariantId: decided ? best.id : null,
    confidence,
    performance,
  };
}

/** Convenience: record several results then decide. */
export function runExperiment(
  exp: ExperimentSpec,
  results: { variantId: string; metric: number }[],
  opts?: { minConfidence?: number }
): ExperimentSpec {
  let e = exp;
  for (const r of results) e = recordResult(e, r.variantId, r.metric);
  return decideWinner(e, opts);
}
