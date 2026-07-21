import { normalizePayload } from "./normalize";
import {
  type BusinessEvent, type BusinessEventType, type Connector, type ConnectorCapabilities,
  type ConnectorCategory, type ConnectorHealth, type ConnectorId, type ConnectorStatus,
  type PollResult, type SyncEstimate,
} from "./types";

// Reference connectors (Part 4) — deterministic adapters that SIMULATE external systems.
// No vendor SDKs. Real providers implement the same Connector interface and drop in with
// zero changes to business logic. No connector contains business logic — only collect,
// normalize and publish Business Events.

function hash(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h;
}
const n = (seed: string, key: string, base: number, range: number) => base + (hash(seed + key) % range);

// A deterministic raw record for a given event type + seed. Field names mimic providers;
// the normalization layer canonicalizes them.
function sampleFor(type: BusinessEventType, seed: string): Record<string, unknown> {
  switch (type) {
    case "RevenueReceived": return { amount: n(seed, "amt", 200, 5000), transactions: n(seed, "tx", 1, 40), channel: "checkout" };
    case "LeadCaptured": return { leads: n(seed, "ld", 1, 30), qualified: n(seed, "ql", 0, 10), source: "form" };
    case "TrafficUpdated": return { sessions: n(seed, "s", 100, 8000), users: n(seed, "u", 80, 6000), pageviews: n(seed, "pv", 200, 15000), bounce_rate: n(seed, "b", 20, 60), channel: "organic" };
    case "CampaignPerformanceUpdated": return { impressions: n(seed, "i", 1000, 90000), clicks: n(seed, "c", 20, 3000), ctr: n(seed, "ctr", 1, 8), conversions: n(seed, "cv", 1, 200), spend: n(seed, "sp", 50, 2000), campaign: "launch" };
    case "KeywordRankingUpdated": return { position: n(seed, "p", 1, 40), clicks: n(seed, "kc", 5, 400), impressions: n(seed, "ki", 100, 9000), keyword: "ai cmo" };
    case "FollowerGrowthUpdated": return { followers: n(seed, "f", 500, 50000), growth: n(seed, "g", 0, 500), engagement: n(seed, "e", 10, 2000), platform: "social" };
    case "ConversionRecorded": return { conversions: n(seed, "co", 1, 120), value: n(seed, "v", 20, 4000), campaign: "launch" };
    case "AdPerformanceUpdated": return { impressions: n(seed, "ai", 2000, 120000), clicks: n(seed, "ac", 40, 4000), spend: n(seed, "as", 100, 3000), conversions: n(seed, "acv", 1, 150), platform: "paid" };
    case "CompetitorDetected": return { position: n(seed, "cp", 1, 20), competitor: "okara" };
    case "DocumentUpdated": return { count: n(seed, "d", 1, 10), title: "brief" };
    case "AssetUploaded": return { count: n(seed, "au", 1, 8), title: "asset" };
    case "MissionCompleted": return { value: n(seed, "mv", 1, 100), count: 1 };
  }
}

type ConnectorSpec = {
  label: string;
  category: ConnectorCategory;
  oauth: boolean; webhooks: boolean; historical: boolean;
  rateLimitPerMin: number;
  events: BusinessEventType[];
};

export const CONNECTOR_SPECS: Record<ConnectorId, ConnectorSpec> = {
  google_analytics: { label: "Google Analytics", category: "analytics", oauth: true, webhooks: false, historical: true, rateLimitPerMin: 30, events: ["TrafficUpdated", "ConversionRecorded"] },
  google_search_console: { label: "Google Search Console", category: "seo", oauth: true, webhooks: false, historical: true, rateLimitPerMin: 20, events: ["KeywordRankingUpdated", "TrafficUpdated", "CompetitorDetected"] },
  google_ads: { label: "Google Ads", category: "ads", oauth: true, webhooks: false, historical: true, rateLimitPerMin: 20, events: ["AdPerformanceUpdated", "ConversionRecorded"] },
  meta_ads: { label: "Meta Ads", category: "ads", oauth: true, webhooks: true, historical: true, rateLimitPerMin: 20, events: ["AdPerformanceUpdated", "CampaignPerformanceUpdated"] },
  linkedin: { label: "LinkedIn", category: "social", oauth: true, webhooks: false, historical: false, rateLimitPerMin: 15, events: ["FollowerGrowthUpdated", "CampaignPerformanceUpdated"] },
  x: { label: "X", category: "social", oauth: true, webhooks: true, historical: false, rateLimitPerMin: 30, events: ["FollowerGrowthUpdated"] },
  youtube: { label: "YouTube", category: "social", oauth: true, webhooks: false, historical: true, rateLimitPerMin: 20, events: ["FollowerGrowthUpdated", "TrafficUpdated"] },
  tiktok: { label: "TikTok", category: "social", oauth: true, webhooks: true, historical: false, rateLimitPerMin: 15, events: ["FollowerGrowthUpdated", "CampaignPerformanceUpdated"] },
  stripe: { label: "Stripe", category: "payments", oauth: false, webhooks: true, historical: true, rateLimitPerMin: 60, events: ["RevenueReceived", "ConversionRecorded"] },
  hubspot: { label: "HubSpot", category: "crm", oauth: true, webhooks: true, historical: true, rateLimitPerMin: 30, events: ["LeadCaptured", "ConversionRecorded"] },
  salesforce: { label: "Salesforce", category: "crm", oauth: true, webhooks: true, historical: true, rateLimitPerMin: 20, events: ["LeadCaptured", "RevenueReceived"] },
  shopify: { label: "Shopify", category: "commerce", oauth: true, webhooks: true, historical: true, rateLimitPerMin: 40, events: ["RevenueReceived", "ConversionRecorded", "TrafficUpdated"] },
  notion: { label: "Notion", category: "docs", oauth: true, webhooks: false, historical: false, rateLimitPerMin: 30, events: ["DocumentUpdated"] },
  slack: { label: "Slack", category: "docs", oauth: true, webhooks: true, historical: false, rateLimitPerMin: 60, events: ["DocumentUpdated", "MissionCompleted"] },
  github: { label: "GitHub", category: "dev", oauth: true, webhooks: true, historical: true, rateLimitPerMin: 60, events: ["DocumentUpdated", "MissionCompleted"] },
  google_drive: { label: "Google Drive", category: "docs", oauth: true, webhooks: false, historical: false, rateLimitPerMin: 30, events: ["DocumentUpdated", "AssetUploaded"] },
  figma: { label: "Figma", category: "docs", oauth: true, webhooks: true, historical: false, rateLimitPerMin: 30, events: ["AssetUploaded", "DocumentUpdated"] },
};

const VERSION = "ref-1";

export class ReferenceConnector implements Connector {
  private spec: ConnectorSpec;
  private _status: ConnectorStatus;
  private now: () => number;

  constructor(readonly id: ConnectorId, opts: { now?: () => number } = {}) {
    this.spec = CONNECTOR_SPECS[id];
    this.now = opts.now ?? (() => 0);
    this._status = {
      id, state: "disconnected", lastSyncAt: null, nextSyncAt: null, cursor: 0,
      eventsProduced: 0, errors: 0, version: VERSION,
    };
  }

  capabilities(): ConnectorCapabilities {
    return {
      id: this.id, label: this.spec.label, category: this.spec.category,
      oauth: this.spec.oauth, polling: true, webhooks: this.spec.webhooks,
      incremental: true, historical: this.spec.historical, rateLimitPerMin: this.spec.rateLimitPerMin, version: VERSION,
    };
  }

  async connect(): Promise<ConnectorStatus> { this._status = { ...this._status, state: "connected", nextSyncAt: this.now() + 300_000 }; return this.status(); }
  async disconnect(): Promise<ConnectorStatus> { this._status = { ...this._status, state: "disconnected", nextSyncAt: null }; return this.status(); }
  async refresh(): Promise<ConnectorStatus> { this._status = { ...this._status, state: this._status.state === "connected" ? "connected" : "disconnected" }; return this.status(); }
  async health(): Promise<ConnectorHealth> { return { id: this.id, healthy: this._status.state !== "error", latencyMs: 20 + (hash(this.id) % 80) }; }
  status(): ConnectorStatus { return { ...this._status }; }

  async poll(opts: { tenant: string; cursor?: number; historical?: boolean } = { tenant: "default" }): Promise<PollResult> {
    const cursor = opts.cursor ?? this._status.cursor;
    const batches = opts.historical ? 3 : 1; // historical replays a few windows
    const events: BusinessEvent[] = [];
    for (let b = 0; b < batches; b++) {
      const c = cursor + b;
      for (const type of this.spec.events) {
        const seed = `${this.id}:${c}:${type}`;
        const raw = sampleFor(type, seed);
        events.push(this.event(type, raw, opts.tenant, c));
      }
    }
    const nextCursor = cursor + batches;
    this._status = { ...this._status, cursor: nextCursor, lastSyncAt: this.now(), nextSyncAt: this.now() + 300_000, eventsProduced: this._status.eventsProduced + events.length };
    return { events, cursor: nextCursor };
  }

  handleWebhook(payload: Record<string, unknown>, tenant: string): BusinessEvent[] {
    const type = (this.spec.events.includes(payload.type as BusinessEventType) ? payload.type : this.spec.events[0]) as BusinessEventType;
    const raw = (payload.data as Record<string, unknown>) ?? sampleFor(type, `${this.id}:webhook`);
    return [this.event(type, raw, tenant, this._status.cursor)];
  }

  normalize(type: BusinessEventType, raw: Record<string, unknown>) {
    return normalizePayload(type, raw, this.now());
  }

  estimateSync(opts: { historical?: boolean } = {}): SyncEstimate {
    const perPoll = this.spec.events.length;
    const records = opts.historical ? perPoll * 3 : perPoll;
    return { records, durationMs: records * 40 };
  }

  supportedEvents(): BusinessEventType[] { return [...this.spec.events]; }

  private event(type: BusinessEventType, raw: Record<string, unknown>, tenant: string, cursor: number): BusinessEvent {
    const normalizedPayload = this.normalize(type, raw);
    return {
      id: `be_${this.id}_${cursor}_${type}`,
      tenant, connector: this.id, timestamp: this.now(), source: `${this.id}:${cursor}`,
      entity: normalizedPayload.entity, type, payload: raw, normalizedPayload,
      confidence: 0.9, version: 1,
    };
  }
}

/** The full set of reference connectors, one per supported platform. */
export function createReferenceConnectors(now: () => number = () => 0): Connector[] {
  return (Object.keys(CONNECTOR_SPECS) as ConnectorId[]).map((id) => new ReferenceConnector(id, { now }));
}
