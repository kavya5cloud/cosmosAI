import { evaluateAll } from "@/lib/creative/evaluators";
import type {
  ApprovalVerdict,
  CouncilDecision,
  CreativeSubject,
  EvaluationContext,
  EvaluatorResult,
  ReviewIssue,
  ReviewerId,
  ReviewerResult,
} from "@/lib/creative/types";
import { review, type Weighted } from "./reviewer-kit";

// Creative Council — six reviewer personas plus the Approval Council that aggregates
// them into a single verdict. Every reviewer is deterministic and composes the
// Creative Director's evaluators; nothing here generates content.

// Which evaluators each reviewer weighs, and how heavily.
const REVIEWER_WEIGHTS: Record<ReviewerId, Weighted[]> = {
  brand_guardian: [
    { id: "brand_alignment", weight: 0.7 },
    { id: "claim_verification", weight: 0.3 },
  ],
  story_reviewer: [
    { id: "mission_alignment", weight: 0.55 },
    { id: "campaign_alignment", weight: 0.45 },
  ],
  copy_reviewer: [
    { id: "readability", weight: 0.4 },
    { id: "originality", weight: 0.3 },
    { id: "completeness", weight: 0.3 },
  ],
  visual_reviewer: [
    { id: "platform_suitability", weight: 0.6 },
    { id: "brand_alignment", weight: 0.4 },
  ],
  platform_reviewer: [
    { id: "platform_suitability", weight: 0.6 },
    { id: "campaign_alignment", weight: 0.4 },
  ],
  performance_reviewer: [
    { id: "completeness", weight: 0.4 },
    { id: "campaign_alignment", weight: 0.35 },
    { id: "claim_verification", weight: 0.25 },
  ],
};

export const REVIEWER_IDS = Object.keys(REVIEWER_WEIGHTS) as ReviewerId[];

/** Run a single reviewer against an already-computed evaluator panel. */
export function runReviewer(reviewer: ReviewerId, panel: EvaluatorResult[]): ReviewerResult {
  return review(reviewer, panel, REVIEWER_WEIGHTS[reviewer]);
}

/** Run all six reviewers against the evaluator panel. */
export function runReviewers(panel: EvaluatorResult[]): ReviewerResult[] {
  return REVIEWER_IDS.map((r) => runReviewer(r, panel));
}

// Weight each reviewer's vote in the final aggregate score.
const REVIEWER_VOTE: Record<ReviewerId, number> = {
  brand_guardian: 1.1,
  story_reviewer: 1.1,
  copy_reviewer: 1,
  visual_reviewer: 0.9,
  platform_reviewer: 1,
  performance_reviewer: 1.2,
};

const APPROVE_AT = 0.72;
const REJECT_BELOW = 0.5;

function decideVerdict(score: number, highIssues: ReviewIssue[]): ApprovalVerdict {
  // Reject only when the asset is genuinely weak: a low aggregate score, or a pile of
  // independent blocking issues. A single blocking issue on otherwise-solid work is a
  // revision, not a rejection — rejecting a 76% asset reads as a contradiction.
  if (score < REJECT_BELOW || highIssues.length >= 3) return "REJECTED";
  // Clean and strong → approve.
  if (score >= APPROVE_AT && highIssues.length === 0) return "APPROVED";
  return "REVISION_REQUIRED";
}

function reasoningFor(verdict: ApprovalVerdict, score: number, reviews: ReviewerResult[], highIssues: ReviewIssue[]): string {
  const pct = Math.round(score * 100);
  const weakest = [...reviews].sort((a, b) => a.score - b.score)[0];
  const strongest = [...reviews].sort((a, b) => b.score - a.score)[0];
  const label = (r: ReviewerId) => r.replace(/_/g, " ");
  switch (verdict) {
    case "APPROVED":
      return `Approved at ${pct}% council confidence. Strongest area: ${label(strongest.reviewer)}. No blocking issues raised.`;
    case "REJECTED":
      return `Rejected at ${pct}%. ${highIssues.length} blocking issue(s), led by ${label(weakest.reviewer)}. Needs a rework, not a tweak.`;
    default:
      return `Revision required at ${pct}%. ${label(weakest.reviewer)} is the weakest area${highIssues.length ? ` with ${highIssues.length} blocking issue(s)` : ""}; address the suggestions and resubmit.`;
  }
}

/**
 * Approval Council — the aggregate decision. Runs the evaluator panel once, has every
 * reviewer weigh in, then combines into APPROVED / REVISION_REQUIRED / REJECTED with
 * deterministic reasoning and the full evidence trail.
 */
export function runCouncil(subject: CreativeSubject, ctx: EvaluationContext): CouncilDecision {
  const evaluations = evaluateAll(subject, ctx);
  const reviews = runReviewers(evaluations);

  let voteSum = 0;
  let confSum = 0;
  let wSum = 0;
  for (const r of reviews) {
    const w = REVIEWER_VOTE[r.reviewer];
    voteSum += r.score * w;
    confSum += r.confidence * w;
    wSum += w;
  }
  const score = wSum > 0 ? voteSum / wSum : 0;
  const confidence = wSum > 0 ? confSum / wSum : 0;

  const blockingIssues = reviews.flatMap((r) => r.issues.filter((i) => i.severity === "high"));
  const verdict = decideVerdict(score, blockingIssues);

  return {
    verdict,
    score: Math.round(score * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    reasoning: reasoningFor(verdict, score, reviews, blockingIssues),
    reviews,
    evaluations,
    blockingIssues,
  };
}
