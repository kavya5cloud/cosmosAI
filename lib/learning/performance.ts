import type { PlatformId } from "@/lib/publishing/types";
import {
  METRIC_KINDS, type AssetAggregate, type MetricKind, type PerformanceEvent,
} from "./types";

// Performance ingestion (Part 2) — every platform's raw metrics map into ONE unified
// schema, then a deterministic score. No randomness, no LLM: the score is a pure function
// of the metrics via saturating normalization + fixed weights.

// Common raw field aliases each platform might send → our canonical MetricKind.
const ALIASES: Record<string, MetricKind> = {
  impressions: "reach", views: "views", plays: "views", reach: "reach",
  clickthrough: "ctr", ctr: "ctr", click_rate: "ctr",
  watchtime: "watch_time", watch_time: "watch_time", avg_watch: "watch_time",
  conversions: "conversions", signups: "conversions", installs: "conversions",
  revenue: "revenue", sales: "revenue",
  shares: "shares", reposts: "shares", retweets: "shares",
  comments: "comments", replies: "replies",
  likes: "likes", reactions: "likes", favorites: "likes",
  bookmarks: "bookmarks", saves: "bookmarks",
  time_on_page: "time_on_page", dwell: "time_on_page",
  opens: "email_opens", email_opens: "email_opens",
};

/** Normalize a raw platform payload into a unified PerformanceEvent. Deterministic. */
export function normalizePerformanceEvent(raw: {
  id?: string; assetKey: string; platform: PlatformId; kind?: PerformanceEvent["kind"];
  campaignId?: string | null; missionId?: string | null; industry?: string | null; audience?: string | null;
  at?: number; metrics?: Record<string, number>;
}): PerformanceEvent {
  const metrics: Partial<Record<MetricKind, number>> = {};
  for (const [rawKey, val] of Object.entries(raw.metrics ?? {})) {
    if (typeof val !== "number" || !Number.isFinite(val)) continue;
    const lower = rawKey.toLowerCase();
    const key: MetricKind | undefined =
      ALIASES[lower] ?? ((METRIC_KINDS as readonly string[]).includes(lower) ? (lower as MetricKind) : undefined);
    if (key) metrics[key] = (metrics[key] ?? 0) + val;
  }
  return {
    id: raw.id ?? `${raw.platform}:${raw.assetKey}:${raw.at ?? 0}`,
    assetKey: raw.assetKey, kind: raw.kind, platform: raw.platform,
    campaignId: raw.campaignId ?? null, missionId: raw.missionId ?? null,
    industry: raw.industry ?? null, audience: raw.audience ?? null,
    at: raw.at ?? 0, metrics,
  };
}

// Per-metric weight + saturation constant k (score contribution = w * x/(x+k)).
// Rates (ctr) are already 0..1 and used directly. Conversion/revenue weigh highest.
const METRIC_MODEL: Record<MetricKind, { w: number; k: number; rate?: boolean }> = {
  revenue:      { w: 0.22, k: 500 },
  conversions:  { w: 0.20, k: 50 },
  ctr:          { w: 0.12, k: 0, rate: true },
  watch_time:   { w: 0.08, k: 30 },
  shares:       { w: 0.08, k: 50 },
  bookmarks:    { w: 0.07, k: 40 },
  comments:     { w: 0.06, k: 40 },
  replies:      { w: 0.05, k: 20 },
  email_opens:  { w: 0.04, k: 200 },
  likes:        { w: 0.04, k: 200 },
  time_on_page: { w: 0.02, k: 60 },
  reach:        { w: 0.01, k: 5000 },
  views:        { w: 0.01, k: 5000 },
};

/** Deterministic 0..1 performance score from a metric bag. */
export function performanceScore(metrics: Partial<Record<MetricKind, number>>): number {
  let score = 0;
  for (const k of METRIC_KINDS) {
    const m = METRIC_MODEL[k];
    const x = metrics[k];
    if (typeof x !== "number" || x <= 0) continue;
    const contribution = m.rate ? Math.min(1, x) : x / (x + m.k);
    score += m.w * contribution;
  }
  return Math.round(Math.min(1, score) * 1000) / 1000;
}

/** Aggregate events per asset: sum metrics, score the totals, find the best posting hour. */
export function aggregatePerformance(events: PerformanceEvent[]): AssetAggregate[] {
  const groups = new Map<string, PerformanceEvent[]>();
  for (const e of events) (groups.get(e.assetKey) ?? groups.set(e.assetKey, []).get(e.assetKey)!).push(e);

  const out: AssetAggregate[] = [];
  for (const [assetKey, evs] of groups) {
    const totals: Partial<Record<MetricKind, number>> = {};
    for (const e of evs) for (const k of METRIC_KINDS) {
      const v = e.metrics[k];
      if (typeof v === "number") totals[k] = (totals[k] ?? 0) + v;
    }
    // Best hour = the hour whose events have the highest mean score.
    const byHour = new Map<number, number[]>();
    for (const e of evs) {
      if (!e.at) continue;
      const h = new Date(e.at).getUTCHours();
      (byHour.get(h) ?? byHour.set(h, []).get(h)!).push(performanceScore(e.metrics));
    }
    let bestHour: number | null = null;
    let bestMean = -1;
    for (const [h, scores] of [...byHour.entries()].sort((a, b) => a[0] - b[0])) {
      const mean = scores.reduce((s, x) => s + x, 0) / scores.length;
      if (mean > bestMean) { bestMean = mean; bestHour = h; }
    }
    const first = evs[0];
    out.push({
      assetKey, kind: first.kind, platform: first.platform,
      campaignId: first.campaignId, audience: first.audience, industry: first.industry,
      eventCount: evs.length, totals, score: performanceScore(totals), bestHour,
    });
  }
  return out.sort((a, b) => b.score - a.score || a.assetKey.localeCompare(b.assetKey));
}
