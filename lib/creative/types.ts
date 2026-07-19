// Shared Creative Foundation types — the contracts the Asset Planner, Creative
// Director evaluators, and Approval Council all speak. Pure types only.

import type { AssetKind, CreativeCategory, CreativeChannel } from "@/lib/creative/taxonomy";

/** The mission/campaign/brief inputs the planner reasons over. Mirrors the existing
 *  CampaignInput/CreativeBrief so it drops straight into the current pipeline. */
export type CreativeBriefInput = {
  objective: string;
  audience: string;
  keyMessage: string;
  emotionalAngle: string;
  proof: string;
  cta: string;
  visualDirection: string;
  successMetric: string;
};

export type PlannerInput = {
  /** Higher-level mission label (e.g. the campaign goal id or a mission name). */
  mission: string;
  campaign: {
    goal: string;
    title: string;
    channels: string[];
    priority?: number;
  };
  brief: CreativeBriefInput;
};

export type LaunchStage = "foundation" | "distribution" | "amplification" | "conversion";

/** One planned deliverable in an AssetPlan. Deterministic, no free text generation. */
export type PlannedAsset = {
  /** Stable key within a plan; also used to express dependencies. */
  key: string;
  kind: AssetKind;
  label: string;
  category: CreativeCategory;
  channel: CreativeChannel;
  stage: LaunchStage;
  /** Ordinal position in the recommended production sequence (1-based). */
  order: number;
  /** Keys of assets this one is derived from / depends on (drives the Asset Graph edges). */
  dependsOn: string[];
  /** Why this asset is in the plan — deterministic rationale, not LLM text. */
  rationale: string;
  quantity: number;
};

export type AssetPlan = {
  planId: string;
  mission: string;
  campaignTitle: string;
  goal: string;
  stages: LaunchStage[];
  assets: PlannedAsset[];
  /** Deterministic summary counts for quick UI/telemetry. */
  summary: { total: number; byStage: Record<LaunchStage, number>; byCategory: Partial<Record<CreativeCategory, number>> };
};

/** ---- Creative Director (evaluators) ---- */

export type EvaluatorId =
  | "brand_alignment"
  | "mission_alignment"
  | "campaign_alignment"
  | "platform_suitability"
  | "readability"
  | "originality"
  | "completeness"
  | "claim_verification";

export type EvaluatorResult = {
  evaluator: EvaluatorId;
  /** 0..1 quality score. */
  score: number;
  /** 0..1 how much evidence the evaluator had to judge on. */
  confidence: number;
  reason: string;
  recommendations: string[];
};

/** The candidate content an evaluator/reviewer inspects. Generation-agnostic. */
export type CreativeSubject = {
  kind: AssetKind;
  channel?: CreativeChannel | string;
  title?: string;
  body: string;
  /** Optional structured extras (e.g. thread tweets, CTA, headline). */
  structure?: Record<string, unknown> | null;
};

export type EvaluationContext = {
  brief: CreativeBriefInput;
  mission?: string;
  campaign?: { goal?: string; title?: string; channels?: string[] };
  /** Known factual claims/proof points the copy may reference (from the brief/business graph). */
  knownFacts?: string[];
};

/** ---- Creative Council (reviewers + verdict) ---- */

export type ReviewerId =
  | "brand_guardian"
  | "story_reviewer"
  | "copy_reviewer"
  | "visual_reviewer"
  | "platform_reviewer"
  | "performance_reviewer";

export type ReviewIssue = { severity: "low" | "medium" | "high"; message: string };

export type ReviewerResult = {
  reviewer: ReviewerId;
  score: number;
  confidence: number;
  issues: ReviewIssue[];
  suggestions: string[];
};

export type ApprovalVerdict = "APPROVED" | "REVISION_REQUIRED" | "REJECTED";

export type CouncilDecision = {
  verdict: ApprovalVerdict;
  score: number;
  confidence: number;
  reasoning: string;
  reviews: ReviewerResult[];
  evaluations: EvaluatorResult[];
  blockingIssues: ReviewIssue[];
};
