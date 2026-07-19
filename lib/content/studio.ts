import type { Sql } from "@/lib/db";
import { recordGeneratedAsset } from "@/lib/services/assets";
import type { AssetKind, CreativeCategory } from "@/lib/creative/taxonomy";
import { kindsForCategory } from "@/lib/creative/taxonomy";
import { planAssets } from "@/lib/creative/asset-planner";
import type { AssetPlan, CreativeBriefInput, PlannerInput } from "@/lib/creative/types";
import type { PipelineResult } from "@/lib/content/types";
import { GenerationRouter, getSharedCache } from "@/lib/content/router";
import { getRegistry } from "@/lib/content/registry";
import { InMemoryHistoryRepo, NeonHistoryRepo, type GenerationHistoryRepo } from "@/lib/content/history";
import { InMemoryMediaRepo, NeonMediaRepo, type MediaRepo } from "@/lib/content/media";
import { runContentPipeline, type AssetStore, type PipelineDeps, type PipelineRequest } from "@/lib/content/pipeline";

// Content Studio — the single facade the app and API talk to. It owns the wiring
// (router + registry + history + media + asset store) and exposes the eight sections.
// Every section runs through the Asset Graph; the user never touches a provider.

/** Neon-backed asset store (writes into content_assets via the Asset Graph). */
export function neonAssetStore(sql: Sql, wsKey: string): AssetStore {
  return {
    async record(input) {
      return recordGeneratedAsset(sql, wsKey, { ...input, actor: "studio" });
    },
  };
}

export type StudioConfig = {
  workspaceKey: string;
  /** Provide a Sql handle to persist to Neon; omit for a fully in-memory studio (tests). */
  sql?: Sql | null;
  router?: GenerationRouter;
  history?: GenerationHistoryRepo;
  media?: MediaRepo;
  assets?: AssetStore;
};

export class ContentStudio {
  readonly deps: PipelineDeps;

  constructor(cfg: StudioConfig) {
    const router = cfg.router ?? new GenerationRouter({ registry: getRegistry(), cache: getSharedCache() });
    const history = cfg.history ?? (cfg.sql ? new NeonHistoryRepo(cfg.sql) : new InMemoryHistoryRepo());
    const media = cfg.media ?? (cfg.sql ? new NeonMediaRepo(cfg.sql) : new InMemoryMediaRepo());
    const assets = cfg.assets ?? (cfg.sql ? neonAssetStore(cfg.sql, cfg.workspaceKey) : undefined);
    this.deps = { router, history, media, assets, workspaceKey: cfg.workspaceKey };
  }

  /** Generate a single asset of any kind (the primitive every section builds on). */
  generate(req: PipelineRequest): Promise<PipelineResult> {
    return runContentPipeline(this.deps, req);
  }

  // ---- Sections. Each maps to the creative taxonomy and runs the Asset Graph pipeline. ----

  images(brief: CreativeBriefInput, kind: AssetKind = "landing_hero", extra: Partial<PipelineRequest> = {}) {
    return this.generate({ kind, brief, ...extra });
  }
  videos(brief: CreativeBriefInput, kind: AssetKind = "hero_video", extra: Partial<PipelineRequest> = {}) {
    return this.generate({ kind, brief, ...extra });
  }
  ugc(brief: CreativeBriefInput, extra: Partial<PipelineRequest> = {}) {
    // UGC is a video with creator-style hints (script/character/voice/style/scene/hooks).
    return this.generate({
      kind: "ugc_video", brief,
      hints: { style: "creator", ...extra.hints },
      ...extra,
    });
  }
  motion(brief: CreativeBriefInput, extra: Partial<PipelineRequest> = {}) {
    return this.generate({ kind: "motion_graphic", brief, ...extra });
  }
  documents(brief: CreativeBriefInput, kind: AssetKind = "blog", extra: Partial<PipelineRequest> = {}) {
    return this.generate({ kind, brief, ...extra });
  }
  ads(brief: CreativeBriefInput, extra: Partial<PipelineRequest> = {}) {
    return this.generate({ kind: "advertisement", brief, ...extra });
  }

  /**
   * Launch — the flagship section. Plans the full asset set (Asset Planner) then runs each
   * planned asset through its pipeline. Returns the plan plus per-asset pipeline results.
   */
  async launch(input: PlannerInput, opts: { campaignId?: string | null; only?: CreativeCategory } = {}): Promise<{ plan: AssetPlan; results: PipelineResult[] }> {
    const plan = planAssets(input);
    const wanted = opts.only ? new Set(kindsForCategory(opts.only).map((m) => m.kind)) : null;
    const results: PipelineResult[] = [];
    const seen = new Set<AssetKind>();
    for (const asset of plan.assets) {
      if (seen.has(asset.kind)) continue; // one generation per distinct kind
      if (wanted && !wanted.has(asset.kind)) continue;
      seen.add(asset.kind);
      results.push(await this.generate({
        kind: asset.kind, brief: input.brief, mission: input.mission,
        campaignId: opts.campaignId ?? null, instruction: asset.rationale,
      }));
    }
    return { plan, results };
  }

  // ---- Library + history pass-through ----

  history(filter: { modality?: string; kind?: string; providerId?: string; assetRootId?: string; limit?: number } = {}) {
    return this.deps.history.list({ workspaceKey: this.deps.workspaceKey, ...filter });
  }
  library(query: { mediaType?: import("@/lib/content/types").MediaType; q?: string; tag?: string; limit?: number } = {}) {
    return this.deps.media.search({ workspaceKey: this.deps.workspaceKey, ...query });
  }
}
