import type { AssetKind } from "@/lib/creative/taxonomy";
import type { AssetPlan, CreativeBriefInput, LaunchStage } from "@/lib/creative/types";

// Launch Engine — contracts for orchestrating a COMPLETE launch, not a single asset.
// A LaunchPlan composes the existing engines (Asset Planner, Campaign Engine, Creative
// Brief, Creative Director) into one connected, deterministic plan. Pure types only.

export type LaunchTemplateId =
  | "product_launch" | "feature_launch" | "startup_launch" | "mobile_app_launch"
  | "saas_launch" | "ai_tool_launch" | "event_launch" | "course_launch"
  | "ecommerce_launch" | "newsletter_launch" | "podcast_launch";

/** What the founder gives us — a mission, not a task list. */
export type LaunchInput = {
  launchType: LaunchTemplateId;
  mission: string;
  business: { name: string; audience?: string; oneLiner?: string; url?: string };
  goals?: string[];          // campaign goal ids (see CAMPAIGN_GOALS) or free text
  budget?: number;           // abstract budget, split across campaigns by priority
  timelineDays?: number;     // overrides the template default
  audience?: string;
  channels?: string[];
  brief?: Partial<CreativeBriefInput>;
};

export type Kpi = { metric: string; target: string; timeframe: string };

export type LaunchObjective = { id: string; statement: string; kpi?: string };

/** A campaign inside the launch — carries its brief and its full asset plan. */
export type LaunchCampaign = {
  id: string;
  title: string;
  goal: string;
  phase: LaunchStage;
  channels: string[];
  priority: number;          // 1 (highest) … 5
  budgetShare: number;       // 0..1 fraction of total budget
  brief: CreativeBriefInput;
  assetPlan: AssetPlan;
};

export type TimelineItem = {
  campaignId: string;
  assetKey: string;          // unique across the launch (campaignId:kind)
  kind: AssetKind;
  label: string;
  channel: string;
  stage: LaunchStage;
  quantity: number;
};

export type TimelineWeek = {
  week: number;              // 1-based
  label: string;
  phase: LaunchStage;
  items: TimelineItem[];
};

export type DependencyNode = {
  key: string;               // campaignId:kind
  kind: AssetKind;
  label: string;
  campaignId: string;
  dependsOn: string[];       // upstream keys this asset is derived from
  dependents: string[];      // downstream keys derived from this asset
  depth: number;
};

export type LaunchDependencyGraph = {
  nodes: DependencyNode[];
  byKey: Record<string, DependencyNode>;
  edges: { from: string; to: string }[];
  roots: string[];
};

export type PublishStage =
  | "draft" | "creative_review" | "approval" | "scheduled"
  | "publishing" | "published" | "measured" | "archived";

export type PublishSlot = {
  assetKey: string;
  kind: AssetKind;
  channel: string;
  week: number;
  /** Day offset from launch start (deterministic scheduling). */
  dayOffset: number;
  stage: PublishStage;
};

export type ExperimentType =
  | "ab_headline" | "ab_hook" | "thumbnail" | "cta" | "caption" | "creative_variant";

export type ExperimentVariant = { id: string; label: string; metric?: number };

export type ExperimentSpec = {
  id: string;
  type: ExperimentType;
  assetKey: string | null;
  hypothesis: string;
  variants: ExperimentVariant[];
  winnerVariantId: string | null;
  confidence: number | null;   // 0..1
  performance: Record<string, number> | null;
};

export type RiskLevel = "low" | "medium" | "high";
export type Risk = { id: string; level: RiskLevel; area: string; description: string; mitigation: string };

export type LaunchRecommendationType =
  | "missing_asset" | "weak_campaign" | "missed_channel"
  | "publishing_delay" | "low_confidence_asset" | "experiment_opportunity";

export type LaunchRecommendation = {
  type: LaunchRecommendationType;
  severity: RiskLevel;
  message: string;
  evidence: string[];        // evidence-backed — references concrete plan facts
  suggestedAction: string;
};

export type LaunchPlan = {
  launchId: string;
  launchType: LaunchTemplateId;
  mission: string;
  objectives: LaunchObjective[];
  timelineDays: number;
  campaigns: LaunchCampaign[];
  weeks: TimelineWeek[];
  dependencies: LaunchDependencyGraph;
  publishingSchedule: PublishSlot[];
  kpis: Kpi[];
  experiments: ExperimentSpec[];
  risks: Risk[];
  summary: {
    campaignCount: number;
    assetCount: number;
    weekCount: number;
    channels: string[];
  };
};
