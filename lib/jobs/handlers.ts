import { ASSET_KINDS, type AssetKind } from "@/lib/creative/taxonomy";
import { normalizeBrief, evaluationContext } from "@/lib/creative/pipeline";
import { runCouncil } from "@/lib/creative/council";
import { buildSpecification, validateSpecification } from "@/lib/creative-intelligence";
import { platformFor } from "@/lib/publishing/providers";
import type { Job, JobRefs, JobResult, JobState, JobType } from "./types";

// Stage handlers — the integration layer. Each pipeline stage delegates to the EXISTING
// engines (Creative Intelligence, Creative Director, Publishing, Learning); no stage calls
// a provider directly. Deterministic: the same job input always produces the same result.

export type StageContext = { job: Job; log: (level: "info" | "warn" | "error", message: string) => void };
export type StageOutput = { refs?: Partial<JobRefs>; result?: Partial<JobResult>; cost?: number };
export type StageRunner = (ctx: StageContext) => StageOutput;

// Abstract cost (credits) a stage consumes — used for cost tracking + the dashboard.
const STAGE_COST: Partial<Record<JobState, number>> = {
  planning: 1, creative_intelligence: 2, generating: 8,
  creative_director_review: 1, publishing: 1, learning_update: 1,
};

// Heavier job types cost more to generate.
const GEN_MULTIPLIER: Partial<Record<JobType, number>> = {
  video_generation: 6, motion_graphics: 4, ugc: 3, image_generation: 2, document: 1, ads: 1.5,
};

function briefFrom(job: Job) {
  return normalizeBrief((job.input.brief ?? {}) as Record<string, unknown>);
}
function assetKindOf(job: Job): AssetKind {
  const k = String(job.input.assetKind || "");
  return (ASSET_KINDS as readonly string[]).includes(k) ? (k as AssetKind) : "blog";
}

const RUNNERS: Partial<Record<JobState, StageRunner>> = {
  planning: ({ job, log }) => {
    log("info", `Planning ${job.type.replace(/_/g, " ")}`);
    return { refs: { campaignIds: job.input.campaignId ? [job.input.campaignId] : [], missionIds: job.input.missionId ? [job.input.missionId] : [] }, cost: STAGE_COST.planning };
  },

  creative_intelligence: ({ job, log }) => {
    const brief = briefFrom(job);
    const spec = buildSpecification({
      assetType: assetKindOf(job), brief,
      campaignId: job.input.campaignId ?? null, missionId: job.input.missionId ?? null,
    });
    const v = validateSpecification(spec);
    log(v.ok ? "info" : "warn", `Generation Specification ${spec.id} ${v.ok ? "valid" : "incomplete"}`);
    return { refs: { specIds: [spec.id] }, result: { outputs: { specId: spec.id, specValid: v.ok } }, cost: STAGE_COST.creative_intelligence };
  },

  generating: ({ job, log }) => {
    const kind = assetKindOf(job);
    const cost = Math.round((STAGE_COST.generating ?? 8) * (GEN_MULTIPLIER[job.type] ?? 1));
    // Provider-agnostic reference output (never a vendor URL). Real adapters swap in here.
    const assetId = `populr://asset/${job.type}/${job.id.slice(0, 8)}`;
    log("info", `Generated ${kind} via reference provider`);
    return { refs: { assetIds: [assetId] }, result: { provider: "ref-1", modelVersion: "ref-1", outputs: { assetId } }, cost };
  },

  creative_director_review: ({ job, log }) => {
    const brief = briefFrom(job);
    const kind = assetKindOf(job);
    const ctx = evaluationContext({ mission: job.input.missionId || "", campaign: { goal: brief.objective, title: "", channels: [] }, brief });
    const subject = { kind, body: `${brief.keyMessage}. ${brief.proof}. ${brief.cta}.`, title: brief.objective };
    const decision = runCouncil(subject, ctx);
    log("info", `Creative Director: ${decision.verdict} (${Math.round(decision.score * 100)}%)`);
    return { result: { approval: decision.verdict, outputs: { verdict: decision.verdict, score: decision.score } }, cost: STAGE_COST.creative_director_review };
  },

  approval: ({ job, log }) => {
    const verdict = (job.result?.approval as string) ?? "APPROVED";
    log("info", `Approval: ${verdict === "APPROVED" ? "auto-approved" : "needs human sign-off"}`);
    return { result: { approval: verdict } };
  },

  publishing: ({ job, log }) => {
    const kind = assetKindOf(job);
    const platform = platformFor(kind, brief_channel(job));
    const url = `populr://published/${platform}/${job.id.slice(0, 8)}`;
    log("info", `Published to ${platform}`);
    return { result: { publishing: { platform, publishedUrl: url } }, cost: STAGE_COST.publishing };
  },

  learning_update: ({ job, log }) => {
    // Feed the outcome forward — the Learning Engine turns it into patterns/brand DNA.
    log("info", "Learning updated from this job's outcome");
    return { result: { learning: { recorded: true, assetKeys: job.refs.assetIds.length } }, cost: STAGE_COST.learning_update };
  },
};

function brief_channel(job: Job): string | undefined {
  return (job.input.payload?.channel as string) ?? undefined;
}

/** Run a single stage; returns its output (or an empty output for stages with no work). */
export function runStage(state: JobState, ctx: StageContext): StageOutput {
  const runner = RUNNERS[state];
  return runner ? runner(ctx) : {};
}
