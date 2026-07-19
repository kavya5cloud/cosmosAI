import type { CreativeSubject, EvaluationContext, EvaluatorId, EvaluatorResult } from "@/lib/creative/types";
import { brandAlignment } from "./brand-alignment";
import { missionAlignment } from "./mission-alignment";
import { campaignAlignment } from "./campaign-alignment";
import { platformSuitability } from "./platform-suitability";
import { readability } from "./readability";
import { originality } from "./originality";
import { completeness } from "./completeness";
import { claimVerification } from "./claim-verification";

// Creative Director — the registry of independent, deterministic evaluators. Each
// evaluator is a pure function (subject, context) → EvaluatorResult and can be run in
// isolation. `evaluateAll` runs the whole panel.

export type Evaluator = (subject: CreativeSubject, ctx: EvaluationContext) => EvaluatorResult;

export const EVALUATORS: Record<EvaluatorId, Evaluator> = {
  brand_alignment: brandAlignment,
  mission_alignment: missionAlignment,
  campaign_alignment: campaignAlignment,
  platform_suitability: platformSuitability,
  readability,
  originality,
  completeness,
  claim_verification: claimVerification,
};

export const EVALUATOR_IDS = Object.keys(EVALUATORS) as EvaluatorId[];

/** Run one evaluator by id. */
export function evaluate(id: EvaluatorId, subject: CreativeSubject, ctx: EvaluationContext): EvaluatorResult {
  return EVALUATORS[id](subject, ctx);
}

/** Run the full Creative Director panel. Deterministic order. */
export function evaluateAll(subject: CreativeSubject, ctx: EvaluationContext): EvaluatorResult[] {
  return EVALUATOR_IDS.map((id) => EVALUATORS[id](subject, ctx));
}

export {
  brandAlignment, missionAlignment, campaignAlignment, platformSuitability,
  readability, originality, completeness, claimVerification,
};
