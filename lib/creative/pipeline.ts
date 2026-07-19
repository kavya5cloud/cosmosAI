import type { CampaignRow } from "@/lib/services/campaigns";
import { ASSET_KINDS, type AssetKind } from "@/lib/creative/taxonomy";
import { planAssets } from "@/lib/creative/asset-planner";
import { evaluateAll } from "@/lib/creative/evaluators";
import { runCouncil } from "@/lib/creative/council";
import type {
  AssetPlan,
  CouncilDecision,
  CreativeBriefInput,
  CreativeSubject,
  EvaluationContext,
  PlannerInput,
} from "@/lib/creative/types";

// Creative pipeline orchestration — the single path from the existing
// Mission → Campaign → Creative Brief chain into the Creative Foundation:
//
//   Mission → Campaign → Creative Brief → Asset Planner → Creative Director → Approval Council
//
// Generation (future) must always enter through here so no asset can bypass planning
// and review. Everything below is deterministic and server-side.

const BRIEF_FIELDS: (keyof CreativeBriefInput)[] = [
  "objective", "audience", "keyMessage", "emotionalAngle", "proof", "cta", "visualDirection", "successMetric",
];

/** Coerce an arbitrary brief object (e.g. CampaignRow.brief) into a full CreativeBriefInput. */
export function normalizeBrief(raw: Record<string, unknown> | null | undefined): CreativeBriefInput {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out = {} as CreativeBriefInput;
  for (const f of BRIEF_FIELDS) out[f] = typeof r[f] === "string" ? (r[f] as string) : "";
  return out;
}

/** Build a PlannerInput from an explicit request body (used when no campaignId is given). */
export function normalizePlannerInput(raw: unknown): PlannerInput | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const c = (r.campaign ?? {}) as Record<string, unknown>;
  const goal = typeof c.goal === "string" ? c.goal : typeof r.goal === "string" ? (r.goal as string) : "";
  const title = typeof c.title === "string" ? c.title : typeof r.title === "string" ? (r.title as string) : "";
  if (!goal && !title) return null; // need at least a goal or title to plan
  const channels = Array.isArray(c.channels) ? c.channels.map((x) => String(x)) : [];
  return {
    mission: typeof r.mission === "string" && r.mission ? r.mission : goal || title,
    campaign: {
      goal: goal || "default",
      title: title || goal || "Untitled campaign",
      channels,
      priority: typeof c.priority === "number" ? c.priority : undefined,
    },
    brief: normalizeBrief((r.brief ?? {}) as Record<string, unknown>),
  };
}

/** Coerce an arbitrary request body into a CreativeSubject for evaluation. */
export function normalizeSubject(raw: unknown): CreativeSubject | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const body = typeof r.body === "string" ? r.body : "";
  const kind = typeof r.kind === "string" ? r.kind : "";
  if (!body || !(ASSET_KINDS as readonly string[]).includes(kind)) return null;
  return {
    kind: kind as AssetKind,
    channel: typeof r.channel === "string" ? r.channel : undefined,
    title: typeof r.title === "string" ? r.title : undefined,
    body,
    structure: r.structure && typeof r.structure === "object" && !Array.isArray(r.structure)
      ? (r.structure as Record<string, unknown>) : null,
  };
}

/** Build a deterministic PlannerInput from a persisted campaign row. */
export function campaignToPlannerInput(row: CampaignRow, mission?: string): PlannerInput {
  return {
    mission: mission || row.goal || row.title,
    campaign: { goal: row.goal, title: row.title, channels: row.channels || [], priority: row.priority },
    brief: normalizeBrief(row.brief),
  };
}

/** Factual claims the copy is allowed to lean on, derived from the brief. */
export function knownFactsFromBrief(brief: CreativeBriefInput): string[] {
  return [brief.proof, brief.keyMessage].map((s) => s.trim()).filter(Boolean);
}

/** Full evaluation context for the Director/Council from a planner input. */
export function evaluationContext(input: PlannerInput): EvaluationContext {
  return {
    brief: input.brief,
    mission: input.mission,
    campaign: input.campaign,
    knownFacts: knownFactsFromBrief(input.brief),
  };
}

export type PipelineEvaluation = {
  plan: AssetPlan;
  decision: CouncilDecision;
};

/**
 * Run the full deterministic pipeline for a single candidate subject against a
 * planner input: plan the assets, then have the Council (which itself runs the
 * Director's evaluators) review the subject.
 */
export function runCreativePipeline(input: PlannerInput, subject: CreativeSubject): PipelineEvaluation {
  const plan = planAssets(input);
  const ctx = evaluationContext(input);
  const decision = runCouncil(subject, ctx);
  return { plan, decision };
}

export { planAssets, evaluateAll, runCouncil };
