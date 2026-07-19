import type {
  EvaluatorId,
  EvaluatorResult,
  ReviewIssue,
  ReviewerId,
  ReviewerResult,
} from "@/lib/creative/types";

// Shared machinery for the Creative Council reviewers. Each reviewer is a persona
// that composes a weighted subset of the Creative Director's evaluators and turns
// their scores into issues + suggestions. Deterministic throughout.

export type Weighted = { id: EvaluatorId; weight: number };

const SEVERITY_LABEL: Record<EvaluatorId, string> = {
  brand_alignment: "off-brand voice",
  mission_alignment: "mission drift",
  campaign_alignment: "off-message",
  platform_suitability: "wrong format/length",
  readability: "hard to read",
  originality: "generic/derivative",
  completeness: "missing essential parts",
  claim_verification: "unsubstantiated claims",
};

/** Map a 0..1 evaluator score to an issue severity (or null when it's fine).
 *  A blocking (high) issue requires enough confidence to justify it — a low-evidence
 *  evaluator can flag a concern but must not hard-block on it. */
function severityFor(score: number, confidence: number): ReviewIssue["severity"] | null {
  if (score < 0.45) return confidence >= 0.5 ? "high" : "medium";
  if (score < 0.7) return "medium";
  return null;
}

/**
 * Build a ReviewerResult from the evaluator panel by selecting + weighting the
 * evaluators this reviewer cares about.
 */
export function review(
  reviewer: ReviewerId,
  panel: EvaluatorResult[],
  weights: Weighted[]
): ReviewerResult {
  const byId = new Map<EvaluatorId, EvaluatorResult>(panel.map((e) => [e.evaluator, e]));
  let scoreSum = 0;
  let confSum = 0;
  let wSum = 0;
  const issues: ReviewIssue[] = [];
  const suggestions: string[] = [];

  for (const { id, weight } of weights) {
    const e = byId.get(id);
    if (!e) continue;
    scoreSum += e.score * weight;
    confSum += e.confidence * weight;
    wSum += weight;

    const sev = severityFor(e.score, e.confidence);
    if (sev) {
      issues.push({ severity: sev, message: `${SEVERITY_LABEL[id]} (${e.evaluator} ${e.score.toFixed(2)}): ${e.reason}` });
      // Pull the evaluator's recommendations up as concrete suggestions.
      for (const r of e.recommendations) if (!suggestions.includes(r)) suggestions.push(r);
    }
  }

  const score = wSum > 0 ? scoreSum / wSum : 0;
  const confidence = wSum > 0 ? confSum / wSum : 0;

  return {
    reviewer,
    score: Math.round(score * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    issues: issues.sort((a, b) => rank(b.severity) - rank(a.severity)),
    suggestions,
  };
}

function rank(s: ReviewIssue["severity"]): number {
  return s === "high" ? 3 : s === "medium" ? 2 : 1;
}
