import type { AssetKind } from "@/lib/creative/taxonomy";
import { ASSET_KIND_META } from "@/lib/creative/taxonomy";
import type { CreativeBriefInput, CreativeSubject } from "@/lib/creative/types";
import { runCouncil } from "@/lib/creative/council";
import { evaluationContext, knownFactsFromBrief } from "@/lib/creative/pipeline";
import type {
  ApprovalOutcome, DocumentSpec, GenerationResult, GenerationSpec, ImageSpec,
  MediaType, Modality, MotionSpec, PipelineResult, VideoSpec, VoiceSpec,
} from "@/lib/content/types";
import { MODALITY_FOR_KIND } from "@/lib/content/types";
import type { GenerationRouter } from "@/lib/content/router";
import type { GenerationHistoryRepo } from "@/lib/content/history";
import type { MediaRepo } from "@/lib/content/media";

// Content pipelines — the deterministic path each section runs:
//
//   Creative Brief → Asset Planner (kind) → Spec → Provider (router) → Evaluation
//   (Creative Council) → Approval → Asset Graph → History + Media Library
//
// The pipeline is provider-agnostic (goes through the router) and storage-agnostic
// (repositories are injected). No section talks to a vendor or writes SQL directly.

export type AssetStore = {
  /** Persist an approved/produced asset into the Asset Graph; returns its root id. */
  record(input: {
    campaignId: string | null; channel: string; assetType: string; purpose: string;
    title: string; body: string; structure?: Record<string, unknown> | null;
  }): Promise<string>;
};

export type PipelineDeps = {
  router: GenerationRouter;
  history: GenerationHistoryRepo;
  media: MediaRepo;
  /** Optional — when absent, assets aren't written to the graph (e.g. no DB in tests). */
  assets?: AssetStore;
  workspaceKey: string;
};

export type PipelineRequest = {
  kind: AssetKind;
  brief: CreativeBriefInput;
  mission?: string;
  campaignId?: string | null;
  /** Extra instruction appended to the deterministic prompt. */
  instruction?: string;
  /** Vendor-neutral hints (aspect ratio, duration…) forwarded to the spec. */
  hints?: Record<string, unknown>;
  constraints?: { minQuality?: number; maxCredits?: number; preferProviderId?: string };
  /** Skip persistence — used for dry-run/preview. */
  dryRun?: boolean;
};

const MEDIA_TYPE_FOR_MODALITY: Record<Modality, MediaType> = {
  image: "image", video: "video", motion: "motion_asset", voice: "audio", document: "template",
};

/** Deterministic base prompt from the brief — no LLM, no randomness. */
function basePrompt(kind: AssetKind, brief: CreativeBriefInput, instruction?: string): string {
  const label = ASSET_KIND_META[kind]?.label ?? kind;
  const parts = [
    `${label} for ${brief.audience || "the target audience"}.`,
    brief.keyMessage ? `Message: ${brief.keyMessage}.` : "",
    brief.emotionalAngle ? `Tone: ${brief.emotionalAngle}.` : "",
    brief.visualDirection ? `Look: ${brief.visualDirection}.` : "",
    brief.cta ? `CTA: ${brief.cta}.` : "",
    instruction ? `Note: ${instruction}` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

/** Build a modality-specific, vendor-neutral spec for a kind. */
export function buildSpec(req: PipelineRequest): GenerationSpec {
  const modality = MODALITY_FOR_KIND[req.kind];
  if (!modality) throw new Error(`no_modality_for_kind:${req.kind}`);
  const prompt = basePrompt(req.kind, req.brief, req.instruction);
  const hints: Record<string, unknown> = { title: ASSET_KIND_META[req.kind]?.label, ...req.hints };

  switch (modality) {
    case "image":
      return { modality, kind: req.kind, prompt, brief: req.brief, hints,
        aspectRatio: (hints.aspectRatio as string) ?? "1:1", count: (hints.count as number) ?? 1 } satisfies ImageSpec;
    case "video":
      return { modality, kind: req.kind, prompt, brief: req.brief, hints,
        durationSec: (hints.durationSec as number) ?? 30, aspectRatio: (hints.aspectRatio as string) ?? "16:9",
        script: (hints.script as string) ?? prompt } satisfies VideoSpec;
    case "motion":
      return { modality, kind: req.kind, prompt, brief: req.brief, hints,
        durationSec: (hints.durationSec as number) ?? 10, aspectRatio: (hints.aspectRatio as string) ?? "16:9" } satisfies MotionSpec;
    case "voice":
      return { modality, kind: req.kind, prompt, brief: req.brief, hints,
        script: (hints.script as string) ?? prompt } satisfies VoiceSpec;
    case "document":
      return { modality, kind: req.kind, prompt, brief: req.brief, hints,
        format: req.kind, sections: (hints.sections as string[]) ?? undefined } satisfies DocumentSpec;
  }
}

/** Turn a generation result into the text the Creative Council evaluates. */
function subjectFor(result: GenerationResult, spec: GenerationSpec): CreativeSubject {
  const body = result.output.content ?? spec.prompt;
  return {
    kind: result.kind,
    channel: ASSET_KIND_META[result.kind]?.channel,
    title: (spec.hints?.title as string) ?? result.kind,
    body,
    structure: result.output.media?.length ? { media: result.output.media } : null,
  };
}

/**
 * Run the full pipeline for one asset kind. Provider selection + fallback + caching are
 * the router's job; evaluation is the Council's; persistence is the injected repos'.
 */
export async function runContentPipeline(deps: PipelineDeps, req: PipelineRequest): Promise<PipelineResult> {
  const spec = buildSpec(req);
  const result = await deps.router.generate({
    spec,
    constraints: req.constraints,
    options: {},
  });

  // Evaluate the produced concept/copy against the brief.
  const ctx = evaluationContext({
    mission: req.mission ?? "",
    campaign: { goal: "", title: "", channels: [] },
    brief: req.brief,
  });
  ctx.knownFacts = knownFactsFromBrief(req.brief);
  const decision = runCouncil(subjectFor(result, spec), ctx);
  const approval: ApprovalOutcome = decision.verdict;

  if (req.dryRun) {
    return { result, decision, approval, historyId: null, mediaId: null, assetRootId: null };
  }

  // Persist to the Asset Graph (source of truth).
  let assetRootId: string | null = null;
  if (deps.assets) {
    assetRootId = await deps.assets.record({
      campaignId: req.campaignId ?? null,
      channel: String(ASSET_KIND_META[req.kind]?.channel ?? "unknown"),
      assetType: req.kind,
      purpose: req.brief.objective || "generated",
      title: (spec.hints?.title as string) ?? req.kind,
      body: result.output.content ?? spec.prompt,
      structure: { spec: { modality: spec.modality, kind: spec.kind }, media: result.output.media ?? [], providerId: result.providerId },
    });
  }

  // Media Library: store each produced artifact.
  let mediaId: string | null = null;
  const mediaType = MEDIA_TYPE_FOR_MODALITY[spec.modality];
  for (const m of result.output.media ?? []) {
    const item = await deps.media.put({
      workspaceKey: deps.workspaceKey, mediaType, uri: m.uri, mime: m.mime,
      title: (spec.hints?.title as string) ?? req.kind, tags: [spec.modality, req.kind],
      kind: req.kind, providerId: result.providerId, assetRootId,
      bytes: m.bytes ?? null, width: m.width ?? null, height: m.height ?? null, durationMs: m.durationMs ?? null,
      meta: { promptHash: result.promptHash },
    });
    mediaId = mediaId ?? item.id;
  }

  // Generation History: never lose the record.
  const entry = await deps.history.record({
    workspaceKey: deps.workspaceKey, modality: spec.modality, kind: req.kind,
    providerId: result.providerId, providerVersion: result.providerVersion,
    cost: result.cost.credits, latencyMs: result.latencyMs, promptHash: result.promptHash,
    cached: result.cached, brief: req.brief, mission: req.mission ?? null,
    campaignId: req.campaignId ?? null, assetRootId, approval,
    councilScore: decision.score, performance: null,
  });

  return { result, decision, approval, historyId: entry.id, mediaId, assetRootId };
}
