import type { LaunchStage } from "@/lib/creative/types";
import type { ExperimentType, Kpi, LaunchTemplateId } from "@/lib/launch/types";

// Launch templates — the reusable blueprints. A template names the campaigns (each a
// real CAMPAIGN_GOALS goal so the Asset Planner produces the right assets), the
// objectives, KPIs and experiments. Templates hold NO asset logic of their own; they
// compose the existing planners. This is the "I'm launching my AI product" → full plan map.

export type TemplateCampaign = {
  /** A campaign goal id (see CAMPAIGN_GOALS) — drives the Asset Planner. */
  goal: string;
  role: string;              // human title, e.g. "Awareness", "Conversion"
  phase: LaunchStage;
  channels: string[];
  priority: number;          // 1 (highest) … 5
};

export type LaunchTemplate = {
  id: LaunchTemplateId;
  label: string;
  defaultTimelineDays: number;
  objectives: string[];
  campaigns: TemplateCampaign[];
  kpis: Kpi[];
  experiments: { type: ExperimentType; hypothesis: string }[];
};

const CH = {
  awareness: ["articles", "linkedin", "x"],
  social: ["linkedin", "x", "instagram"],
  seo: ["articles", "seo"],
  community: ["reddit", "x", "linkedin"],
  paid: ["ads", "instagram"],
};

// Common KPI + experiment sets, reused across templates to avoid duplication.
const KPI = {
  awareness: { metric: "reach", target: "10k impressions", timeframe: "launch week" } as Kpi,
  signups: { metric: "signups", target: "500 signups", timeframe: "30 days" } as Kpi,
  waitlist: { metric: "waitlist", target: "1,000 joins", timeframe: "pre-launch" } as Kpi,
  revenue: { metric: "revenue", target: "first 100 customers", timeframe: "90 days" } as Kpi,
  engagement: { metric: "engagement rate", target: "5%+", timeframe: "per post" } as Kpi,
};
const EXP = {
  headline: { type: "ab_headline" as ExperimentType, hypothesis: "A benefit-led headline outperforms a feature-led one." },
  hook: { type: "ab_hook" as ExperimentType, hypothesis: "A problem-first hook beats a product-first hook." },
  thumb: { type: "thumbnail" as ExperimentType, hypothesis: "A face-forward thumbnail lifts video CTR." },
  cta: { type: "cta" as ExperimentType, hypothesis: "\"Get early access\" converts better than \"Sign up\"." },
};

export const LAUNCH_TEMPLATES: Record<LaunchTemplateId, LaunchTemplate> = {
  product_launch: {
    id: "product_launch", label: "Product Launch", defaultTimelineDays: 28,
    objectives: ["Build launch-day awareness", "Convert interest into signups", "Establish credibility with proof"],
    campaigns: [
      { goal: "launch_product", role: "Awareness", phase: "foundation", channels: CH.awareness, priority: 1 },
      { goal: "leads", role: "Conversion", phase: "conversion", channels: CH.paid, priority: 2 },
    ],
    kpis: [KPI.awareness, KPI.signups], experiments: [EXP.headline, EXP.cta],
  },
  feature_launch: {
    id: "feature_launch", label: "Feature Launch", defaultTimelineDays: 14,
    objectives: ["Drive adoption of the new feature", "Re-engage existing users"],
    campaigns: [{ goal: "launch_product", role: "Adoption", phase: "distribution", channels: CH.social, priority: 1 }],
    kpis: [KPI.engagement, KPI.awareness], experiments: [EXP.hook],
  },
  startup_launch: {
    id: "startup_launch", label: "Startup Launch", defaultTimelineDays: 42,
    objectives: ["Announce the company", "Attract early customers", "Signal momentum to investors and talent"],
    campaigns: [
      { goal: "launch_product", role: "Announcement", phase: "foundation", channels: CH.awareness, priority: 1 },
      { goal: "fundraising", role: "Credibility", phase: "conversion", channels: CH.awareness, priority: 3 },
      { goal: "hiring", role: "Talent", phase: "amplification", channels: CH.social, priority: 4 },
    ],
    kpis: [KPI.awareness, KPI.signups], experiments: [EXP.headline, EXP.hook],
  },
  mobile_app_launch: {
    id: "mobile_app_launch", label: "Mobile App Launch", defaultTimelineDays: 28,
    objectives: ["Drive installs", "Earn store visibility", "Spark word of mouth"],
    campaigns: [
      { goal: "launch_product", role: "Installs", phase: "foundation", channels: CH.paid, priority: 1 },
      { goal: "go_viral", role: "Virality", phase: "amplification", channels: CH.social, priority: 2 },
    ],
    kpis: [{ metric: "installs", target: "5,000 installs", timeframe: "30 days" }, KPI.engagement],
    experiments: [EXP.thumb, EXP.cta],
  },
  saas_launch: {
    id: "saas_launch", label: "SaaS Launch", defaultTimelineDays: 35,
    objectives: ["Generate qualified trials", "Rank for high-intent search", "Prove ROI with cases"],
    campaigns: [
      { goal: "launch_product", role: "Awareness", phase: "foundation", channels: CH.awareness, priority: 1 },
      { goal: "grow_seo", role: "Search", phase: "distribution", channels: CH.seo, priority: 2 },
      { goal: "leads", role: "Trials", phase: "conversion", channels: CH.paid, priority: 2 },
    ],
    kpis: [KPI.signups, KPI.revenue], experiments: [EXP.headline, EXP.cta],
  },
  ai_tool_launch: {
    id: "ai_tool_launch", label: "AI Tool Launch", defaultTimelineDays: 28,
    objectives: ["Show the magic in a demo", "Win the AI community", "Convert to early access"],
    campaigns: [
      { goal: "launch_product", role: "Demo & awareness", phase: "foundation", channels: CH.awareness, priority: 1 },
      { goal: "go_viral", role: "Community", phase: "amplification", channels: CH.community, priority: 2 },
      { goal: "leads", role: "Early access", phase: "conversion", channels: CH.paid, priority: 2 },
    ],
    kpis: [KPI.waitlist, KPI.signups], experiments: [EXP.hook, EXP.thumb, EXP.cta],
  },
  event_launch: {
    id: "event_launch", label: "Event Launch", defaultTimelineDays: 35,
    objectives: ["Drive registrations", "Build pre-event buzz", "Maximize attendance"],
    campaigns: [
      { goal: "go_viral", role: "Buzz", phase: "amplification", channels: CH.social, priority: 1 },
      { goal: "leads", role: "Registrations", phase: "conversion", channels: CH.paid, priority: 2 },
    ],
    kpis: [{ metric: "registrations", target: "1,000 registrations", timeframe: "pre-event" }, KPI.engagement],
    experiments: [EXP.headline, EXP.cta],
  },
  course_launch: {
    id: "course_launch", label: "Course Launch", defaultTimelineDays: 28,
    objectives: ["Grow the waitlist", "Prove outcomes", "Convert on launch day"],
    campaigns: [
      { goal: "go_viral", role: "Waitlist", phase: "amplification", channels: CH.social, priority: 1 },
      { goal: "leads", role: "Enrollment", phase: "conversion", channels: CH.paid, priority: 2 },
    ],
    kpis: [KPI.waitlist, { metric: "enrollments", target: "200 enrollments", timeframe: "launch week" }],
    experiments: [EXP.hook, EXP.cta],
  },
  ecommerce_launch: {
    id: "ecommerce_launch", label: "Ecommerce Launch", defaultTimelineDays: 21,
    objectives: ["Drive first sales", "Build social proof", "Retarget browsers"],
    campaigns: [
      { goal: "launch_product", role: "Awareness", phase: "foundation", channels: CH.social, priority: 1 },
      { goal: "leads", role: "Sales", phase: "conversion", channels: CH.paid, priority: 1 },
    ],
    kpis: [KPI.revenue, KPI.engagement], experiments: [EXP.thumb, EXP.cta],
  },
  newsletter_launch: {
    id: "newsletter_launch", label: "Newsletter Launch", defaultTimelineDays: 21,
    objectives: ["Grow subscribers", "Establish a voice", "Drive shares"],
    campaigns: [
      { goal: "grow_seo", role: "Discovery", phase: "distribution", channels: CH.seo, priority: 1 },
      { goal: "go_viral", role: "Growth", phase: "amplification", channels: CH.social, priority: 2 },
    ],
    kpis: [{ metric: "subscribers", target: "1,000 subscribers", timeframe: "30 days" }, KPI.engagement],
    experiments: [EXP.headline, EXP.hook],
  },
  podcast_launch: {
    id: "podcast_launch", label: "Podcast Launch", defaultTimelineDays: 28,
    objectives: ["Reach launch-week charts", "Grow a listener base", "Repurpose across social"],
    campaigns: [
      { goal: "go_viral", role: "Reach", phase: "amplification", channels: CH.social, priority: 1 },
      { goal: "grow_seo", role: "Discovery", phase: "distribution", channels: CH.seo, priority: 2 },
    ],
    kpis: [{ metric: "downloads", target: "5,000 downloads", timeframe: "launch month" }, KPI.engagement],
    experiments: [EXP.thumb, EXP.hook],
  },
};

export function getTemplate(id: LaunchTemplateId): LaunchTemplate {
  return LAUNCH_TEMPLATES[id];
}

export const LAUNCH_TEMPLATE_IDS = Object.keys(LAUNCH_TEMPLATES) as LaunchTemplateId[];
