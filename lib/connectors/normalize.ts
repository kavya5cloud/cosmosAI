import type { BusinessEventType, NormalizedKind, NormalizedPayload } from "./types";

// Normalization Layer (Part 6) — the ONE place provider-specific schemas become canonical.
// Downstream services (Business Graph, Learning, Decision Planner) consume only normalized
// payloads, never raw provider shapes. Pure + deterministic.

/** Which normalized kind a Business Event maps to. */
export const NORMALIZED_FOR_EVENT: Record<BusinessEventType, NormalizedKind> = {
  RevenueReceived: "revenue",
  LeadCaptured: "lead",
  TrafficUpdated: "traffic",
  CampaignPerformanceUpdated: "campaign",
  KeywordRankingUpdated: "seo",
  FollowerGrowthUpdated: "social",
  ConversionRecorded: "performance",
  AdPerformanceUpdated: "campaign",
  CompetitorDetected: "seo",
  DocumentUpdated: "performance",
  AssetUploaded: "performance",
  MissionCompleted: "performance",
};

// Raw provider field aliases → canonical metric names. Real adapters extend this map;
// nothing downstream ever sees the raw names.
const METRIC_ALIASES: Record<string, string> = {
  amount: "amount", revenue: "amount", total: "amount", mrr: "amount", sales: "amount",
  transactions: "transactions", orders: "transactions", charges: "transactions",
  leads: "leads", new_leads: "leads", contacts: "leads",
  qualified: "qualified", mql: "qualified", sql: "qualified",
  sessions: "sessions", visits: "sessions",
  users: "users", uniques: "users", visitors: "users",
  pageviews: "pageviews", views: "views", plays: "views", impressions: "impressions",
  clicks: "clicks", ctr: "ctr", click_rate: "ctr",
  conversions: "conversions", signups: "conversions", installs: "conversions",
  spend: "spend", cost: "spend", budget: "spend",
  position: "position", rank: "position", avg_position: "position",
  followers: "followers", subscribers: "followers", fans: "followers",
  growth: "growth", delta: "growth", change: "growth",
  engagement: "engagement", likes: "engagement", reactions: "engagement", comments: "engagement",
  bounce_rate: "bounceRate", bounce: "bounceRate",
  customers: "customers", ltv: "ltv", churn: "churn", value: "value", count: "count",
};

const DIMENSION_KEYS = ["channel", "platform", "campaign", "audience", "country", "keyword", "source", "medium", "device", "competitor", "title", "url"];

/** Normalize a raw provider record for a given business event type. */
export function normalizePayload(type: BusinessEventType, raw: Record<string, unknown>, occurredAt = 0): NormalizedPayload {
  const kind = NORMALIZED_FOR_EVENT[type];
  const metrics: Record<string, number> = {};
  const dimensions: Record<string, string> = {};

  for (const [k, v] of Object.entries(raw)) {
    const lk = k.toLowerCase();
    if (typeof v === "number" && Number.isFinite(v)) {
      const canonical = METRIC_ALIASES[lk];
      if (canonical) metrics[canonical] = (metrics[canonical] ?? 0) + v;
    } else if (typeof v === "string" && DIMENSION_KEYS.includes(lk)) {
      dimensions[lk] = v;
    }
  }

  const entity = String(raw.entity ?? raw.id ?? dimensions.campaign ?? dimensions.keyword ?? kind);
  return {
    kind,
    entity,
    metrics,
    dimensions,
    occurredAt: typeof raw.at === "number" ? raw.at : (typeof raw.timestamp === "number" ? raw.timestamp : occurredAt),
  };
}
