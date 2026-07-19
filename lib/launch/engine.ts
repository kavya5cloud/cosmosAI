import { planAssets } from "@/lib/creative/asset-planner";
import { normalizeBrief } from "@/lib/creative/pipeline";
import type { AssetKind } from "@/lib/creative/taxonomy";
import type { CreativeBriefInput } from "@/lib/creative/types";
import { getTemplate, type LaunchTemplate, type TemplateCampaign } from "@/lib/launch/templates";
import { buildTimeline, assetKey, weekForStage, weekCountFor } from "@/lib/launch/timeline";
import { buildDependencyGraph } from "@/lib/launch/dependencies";
import type {
  ExperimentSpec, Kpi, LaunchCampaign, LaunchInput, LaunchObjective, LaunchPlan,
  PublishSlot, Risk,
} from "@/lib/launch/types";

// Launch Engine — turns "I'm launching X" into a complete, connected LaunchPlan. It
// composes the existing engines (Asset Planner, Creative Brief, Campaign goals) with the
// launch template; it invents no asset logic of its own. Fully deterministic: same input
// → identical plan (stable id from the input).

function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** Base creative brief from the business + any founder overrides. */
function baseBrief(input: LaunchInput, template: LaunchTemplate): CreativeBriefInput {
  const b = input.business;
  return normalizeBrief({
    objective: input.mission || `Launch ${b.name}`,
    audience: input.audience || b.audience || "your audience",
    keyMessage: b.oneLiner || `${b.name}: ${input.mission}`,
    emotionalAngle: "confident and credible",
    proof: "the product and its early traction",
    cta: "get started",
    visualDirection: "clean, modern, on-brand",
    successMetric: template.kpis[0]?.metric || "signups",
    ...input.brief,
  });
}

/** Specialize the base brief for a campaign's role/goal. */
function campaignBrief(base: CreativeBriefInput, tc: TemplateCampaign, businessName: string): CreativeBriefInput {
  return { ...base, objective: `${tc.role}: ${businessName}` };
}

function allocateBudget(campaigns: TemplateCampaign[]): number[] {
  const weights = campaigns.map((c) => 1 / Math.max(1, c.priority));
  const total = weights.reduce((n, w) => n + w, 0) || 1;
  return weights.map((w) => Math.round((w / total) * 100) / 100);
}

const EXPERIMENT_TARGET_KINDS: Record<string, AssetKind[]> = {
  ab_headline: ["landing_hero", "blog", "email"],
  ab_hook: ["x_thread", "ugc_video", "linkedin_post"],
  thumbnail: ["hero_video", "product_demo", "ugc_video"],
  cta: ["landing_hero", "email", "advertisement"],
  caption: ["instagram_post", "carousel"],
  creative_variant: ["advertisement", "carousel"],
};

function seedExperiments(template: LaunchTemplate, campaigns: LaunchCampaign[], launchId: string): ExperimentSpec[] {
  const presentKeys = new Map<AssetKind, string>();
  for (const c of campaigns) for (const a of c.assetPlan.assets) if (!presentKeys.has(a.kind)) presentKeys.set(a.kind, assetKey(c.id, a.kind));

  return template.experiments.map((e, i) => {
    const target = (EXPERIMENT_TARGET_KINDS[e.type] ?? []).map((k) => presentKeys.get(k)).find(Boolean) ?? null;
    return {
      id: `exp_${launchId}_${i}`,
      type: e.type,
      assetKey: target,
      hypothesis: e.hypothesis,
      variants: [
        { id: `${launchId}_${i}_A`, label: "Variant A (control)" },
        { id: `${launchId}_${i}_B`, label: "Variant B (challenger)" },
      ],
      winnerVariantId: null, confidence: null, performance: null,
    };
  });
}

function assessRisks(input: LaunchInput, template: LaunchTemplate, campaigns: LaunchCampaign[], timelineDays: number, maxDepth: number): Risk[] {
  const risks: Risk[] = [];
  if (timelineDays < template.defaultTimelineDays) {
    const gap = template.defaultTimelineDays - timelineDays;
    risks.push({
      id: "timeline_compression", level: gap > template.defaultTimelineDays * 0.4 ? "high" : "medium",
      area: "Timeline", description: `Timeline is ${timelineDays}d vs the recommended ${template.defaultTimelineDays}d for a ${template.label}.`,
      mitigation: "Cut a campaign or move amplification assets into fast-follow.",
    });
  }
  const channels = new Set(campaigns.flatMap((c) => c.channels));
  if (channels.size < 3) {
    risks.push({
      id: "narrow_channels", level: "medium", area: "Distribution",
      description: `Only ${channels.size} distinct channel(s) across the launch.`,
      mitigation: "Add at least one owned and one earned channel for resilience.",
    });
  }
  if (input.budget != null && input.budget < campaigns.length * 100) {
    risks.push({
      id: "thin_budget", level: "medium", area: "Budget",
      description: `Budget of ${input.budget} spread across ${campaigns.length} campaigns is thin.`,
      mitigation: "Concentrate spend on the highest-priority conversion campaign.",
    });
  }
  if (maxDepth >= 3) {
    risks.push({
      id: "long_dependency_chains", level: "medium", area: "Dependencies",
      description: `Some assets sit ${maxDepth} derivations deep; an upstream change ripples widely.`,
      mitigation: "Lock the hero/foundational assets before producing downstream variants.",
    });
  }
  if (!campaigns.some((c) => c.phase === "conversion")) {
    risks.push({
      id: "no_conversion_campaign", level: "medium", area: "Conversion",
      description: "No dedicated conversion campaign — awareness may not turn into outcomes.",
      mitigation: "Add a conversion campaign (leads/sales) to capture demand.",
    });
  }
  return risks;
}

/** Create a complete LaunchPlan from a mission-level input. */
export function createLaunch(input: LaunchInput): LaunchPlan {
  const template = getTemplate(input.launchType);
  const timelineDays = input.timelineDays ?? template.defaultTimelineDays;
  const launchId = `launch_${hash(JSON.stringify({ t: input.launchType, m: input.mission, b: input.business, g: input.goals, d: timelineDays }))}`;

  const base = baseBrief(input, template);
  const budget = allocateBudget(template.campaigns);

  // Build each campaign with its brief + full asset plan (via the existing Asset Planner).
  const campaigns: LaunchCampaign[] = template.campaigns.map((tc, i) => {
    const id = `${launchId}_c${i}`;
    const channels = i === 0 && input.channels?.length ? input.channels : tc.channels;
    const brief = campaignBrief(base, tc, input.business.name);
    const title = `${input.business.name} — ${tc.role}`;
    const assetPlan = planAssets({ mission: input.mission, campaign: { goal: tc.goal, title, channels, priority: tc.priority }, brief });
    return { id, title, goal: tc.goal, phase: tc.phase, channels, priority: tc.priority, budgetShare: budget[i], brief, assetPlan };
  });

  const objectives: LaunchObjective[] = template.objectives.map((statement, i) => ({
    id: `obj_${i}`, statement, kpi: template.kpis[i]?.metric,
  }));

  const weeks = buildTimeline(campaigns, timelineDays);
  const dependencies = buildDependencyGraph(campaigns);
  const maxDepth = dependencies.nodes.reduce((m, n) => Math.max(m, n.depth), 0);
  const publishingSchedule = buildPublishingSchedule(campaigns, timelineDays);
  const experiments = seedExperiments(template, campaigns, launchId);
  const risks = assessRisks(input, template, campaigns, timelineDays, maxDepth);

  const kpis: Kpi[] = template.kpis;
  const channels = [...new Set(campaigns.flatMap((c) => c.channels))].sort();
  const assetCount = campaigns.reduce((n, c) => n + c.assetPlan.summary.total, 0);

  return {
    launchId, launchType: input.launchType, mission: input.mission,
    objectives, timelineDays, campaigns, weeks, dependencies, publishingSchedule,
    kpis, experiments, risks,
    summary: { campaignCount: campaigns.length, assetCount, weekCount: weeks.length, channels },
  };
}

/** Deterministic publishing schedule: each asset gets a day slot inside its timeline week. */
export function buildPublishingSchedule(campaigns: LaunchCampaign[], timelineDays: number): PublishSlot[] {
  const weekCount = weekCountFor(timelineDays);
  const slots: PublishSlot[] = [];
  for (const c of campaigns) {
    c.assetPlan.assets.forEach((a, idx) => {
      const week = weekForStage(a.stage, weekCount);
      const dayOffset = (week - 1) * 7 + (idx % 5) + 1; // spread within the week, deterministic
      slots.push({ assetKey: assetKey(c.id, a.kind), kind: a.kind, channel: a.channel, week, dayOffset, stage: "draft" });
    });
  }
  return slots.sort((a, b) => a.dayOffset - b.dayOffset || a.assetKey.localeCompare(b.assetKey));
}
