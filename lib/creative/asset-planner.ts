import {
  ASSET_KIND_META,
  type AssetKind,
} from "@/lib/creative/taxonomy";
import type { AssetPlan, LaunchStage, PlannedAsset, PlannerInput } from "@/lib/creative/types";

// Deterministic Asset Planner.
//
// Given a Mission + Campaign + Creative Brief it produces a structured AssetPlan: an
// ORDERED set of deliverables with stages, derivation dependencies and rationale.
// There is NO LLM here — the plan is a pure function of the inputs, so the same
// mission always yields the same plan. Generation happens later, downstream.

const STAGE_ORDER: LaunchStage[] = ["foundation", "distribution", "amplification", "conversion"];

const STAGE_OF_KIND: Record<AssetKind, LaunchStage> = {
  hero_video: "foundation",
  product_demo: "foundation",
  landing_hero: "foundation",
  blog: "foundation",
  ugc_video: "amplification",
  motion_graphic: "amplification",
  infographic: "amplification",
  carousel: "amplification",
  instagram_post: "amplification",
  linkedin_post: "distribution",
  x_thread: "distribution",
  reddit_post: "distribution",
  email: "distribution",
  press_release: "conversion",
  sales_deck: "conversion",
  case_study: "conversion",
  advertisement: "conversion",
};

type TemplateEntry = { kind: AssetKind; quantity?: number };

// Ordered launch templates keyed by campaign goal id (see CAMPAIGN_GOALS). The array
// order IS the recommended production sequence.
const GOAL_TEMPLATES: Record<string, TemplateEntry[]> = {
  launch_product: [
    { kind: "hero_video" },
    { kind: "product_demo" },
    { kind: "ugc_video", quantity: 3 },
    { kind: "landing_hero" },
    { kind: "linkedin_post" },
    { kind: "x_thread" },
    { kind: "email" },
    { kind: "carousel" },
    { kind: "press_release" },
    { kind: "sales_deck" },
  ],
  grow_seo: [
    { kind: "blog", quantity: 2 },
    { kind: "landing_hero" },
    { kind: "infographic" },
    { kind: "linkedin_post" },
    { kind: "x_thread" },
    { kind: "email" },
  ],
  go_viral: [
    { kind: "hero_video" },
    { kind: "ugc_video", quantity: 3 },
    { kind: "motion_graphic" },
    { kind: "x_thread" },
    { kind: "carousel" },
    { kind: "instagram_post" },
  ],
  leads: [
    { kind: "landing_hero" },
    { kind: "product_demo" },
    { kind: "linkedin_post" },
    { kind: "email" },
    { kind: "case_study" },
    { kind: "advertisement" },
    { kind: "sales_deck" },
  ],
  hiring: [
    { kind: "blog" },
    { kind: "landing_hero" },
    { kind: "linkedin_post" },
    { kind: "x_thread" },
    { kind: "infographic" },
    { kind: "email" },
  ],
  fundraising: [
    { kind: "blog" },
    { kind: "landing_hero" },
    { kind: "sales_deck" },
    { kind: "press_release" },
    { kind: "linkedin_post" },
    { kind: "email" },
  ],
};

const DEFAULT_TEMPLATE: TemplateEntry[] = [
  { kind: "blog" },
  { kind: "landing_hero" },
  { kind: "linkedin_post" },
  { kind: "x_thread" },
  { kind: "email" },
  { kind: "carousel" },
];

// Campaign channel vocabulary (ranking vocab) → the distribution kind it implies.
const CHANNEL_TO_KIND: Record<string, AssetKind> = {
  articles: "blog",
  seo: "blog",
  geo: "blog",
  hn: "blog",
  linkedin: "linkedin_post",
  x: "x_thread",
  reddit: "reddit_post",
  email: "email",
  instagram: "carousel",
};

/** Stable, dependency-free hash so plan ids are deterministic across environments. */
function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

function pickParentKey(
  kind: AssetKind,
  present: Map<AssetKind, string>,
  rootKey: string
): string[] {
  const has = (k: AssetKind) => present.get(k);
  const stage = STAGE_OF_KIND[kind];
  if (stage === "foundation") {
    // Foundational assets derive from the root (or nothing if they ARE the root).
    return present.get(kind) === rootKey ? [] : [rootKey];
  }
  if (kind === "ugc_video" || kind === "motion_graphic") {
    return [has("product_demo") || has("hero_video") || rootKey];
  }
  if (kind === "carousel" || kind === "infographic" || kind === "instagram_post") {
    return [has("landing_hero") || has("blog") || rootKey];
  }
  if (stage === "distribution") {
    return [has("blog") || has("landing_hero") || rootKey];
  }
  // conversion
  return [rootKey];
}

function rationaleFor(kind: AssetKind, brief: PlannerInput["brief"]): string {
  const stage = STAGE_OF_KIND[kind];
  const label = ASSET_KIND_META[kind].label;
  switch (stage) {
    case "foundation":
      return `${label} anchors the launch narrative around "${brief.keyMessage}".`;
    case "amplification":
      return `${label} amplifies the message for ${brief.audience} in a native, scroll-stopping format.`;
    case "distribution":
      return `${label} distributes the story to ${brief.audience} on its home channel.`;
    case "conversion":
      return `${label} converts interest into ${brief.successMetric || "the target outcome"}.`;
  }
}

/**
 * Produce a deterministic AssetPlan from a mission/campaign/brief.
 * Same input → identical plan (no randomness, no LLM).
 */
export function planAssets(input: PlannerInput): AssetPlan {
  const goal = input.campaign.goal;
  const template = GOAL_TEMPLATES[goal] ?? DEFAULT_TEMPLATE;

  // 1) Start from the ordered template.
  const entries: TemplateEntry[] = template.map((e) => ({ ...e }));
  const presentKinds = new Set<AssetKind>(entries.map((e) => e.kind));

  // 2) Ensure every campaign channel has a distribution asset. Insert channel extras
  //    just before the conversion assets so the sequence stays natural.
  const channelExtras: TemplateEntry[] = [];
  for (const raw of input.campaign.channels || []) {
    const kind = CHANNEL_TO_KIND[String(raw).toLowerCase().trim()];
    if (kind && !presentKinds.has(kind)) {
      channelExtras.push({ kind });
      presentKinds.add(kind);
    }
  }
  const head = entries.filter((e) => STAGE_OF_KIND[e.kind] !== "conversion");
  const tail = entries.filter((e) => STAGE_OF_KIND[e.kind] === "conversion");
  const ordered = [...head, ...channelExtras, ...tail];

  // 3) Assign keys and resolve the root (first foundation asset, else first asset).
  const keyFor = (kind: AssetKind) => kind;
  const firstFoundation = ordered.find((e) => STAGE_OF_KIND[e.kind] === "foundation");
  const rootKey = keyFor((firstFoundation ?? ordered[0]).kind);
  const kindToKey = new Map<AssetKind, string>(ordered.map((e) => [e.kind, keyFor(e.kind)]));

  // 4) Build the planned assets with stage, order, dependencies and rationale.
  const assets: PlannedAsset[] = ordered.map((e, idx) => {
    const meta = ASSET_KIND_META[e.kind];
    return {
      key: keyFor(e.kind),
      kind: e.kind,
      label: meta.label,
      category: meta.category,
      channel: meta.channel,
      stage: STAGE_OF_KIND[e.kind],
      order: idx + 1,
      dependsOn: pickParentKey(e.kind, kindToKey, rootKey),
      rationale: rationaleFor(e.kind, input.brief),
      quantity: e.quantity ?? 1,
    };
  });

  // 5) Deterministic summary.
  const byStage = { foundation: 0, distribution: 0, amplification: 0, conversion: 0 } as Record<LaunchStage, number>;
  const byCategory: AssetPlan["summary"]["byCategory"] = {};
  for (const a of assets) {
    byStage[a.stage] += a.quantity;
    byCategory[a.category] = (byCategory[a.category] ?? 0) + a.quantity;
  }
  const stages = STAGE_ORDER.filter((s) => byStage[s] > 0);
  const total = assets.reduce((n, a) => n + a.quantity, 0);

  const planId = "plan_" + hash(JSON.stringify({ mission: input.mission, campaign: input.campaign, brief: input.brief }));

  return {
    planId,
    mission: input.mission,
    campaignTitle: input.campaign.title,
    goal,
    stages,
    assets,
    summary: { total, byStage, byCategory },
  };
}
