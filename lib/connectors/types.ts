// Integration & Connector Platform — types. Connectors only collect, normalize and
// publish Business Events; they NEVER modify business objects. The Business Event is the
// single integration contract between external systems and the rest of Populr.

export const CONNECTOR_IDS = [
  "google_analytics", "google_search_console", "google_ads", "meta_ads", "linkedin",
  "x", "youtube", "tiktok", "stripe", "hubspot", "salesforce", "shopify",
  "notion", "slack", "github", "google_drive", "figma",
] as const;
export type ConnectorId = (typeof CONNECTOR_IDS)[number];

export type ConnectorCategory = "analytics" | "seo" | "ads" | "social" | "payments" | "crm" | "commerce" | "docs" | "dev";

// ---- Business Events (Part 5) — the canonical language ----

export const BUSINESS_EVENT_TYPES = [
  "RevenueReceived", "LeadCaptured", "TrafficUpdated", "CampaignPerformanceUpdated",
  "KeywordRankingUpdated", "FollowerGrowthUpdated", "ConversionRecorded", "AdPerformanceUpdated",
  "CompetitorDetected", "DocumentUpdated", "AssetUploaded", "MissionCompleted",
] as const;
export type BusinessEventType = (typeof BUSINESS_EVENT_TYPES)[number];

// ---- Normalized events (Part 6) — the only thing downstream consumes ----

export const NORMALIZED_KINDS = [
  "traffic", "revenue", "lead", "campaign", "seo", "social", "performance", "customer",
] as const;
export type NormalizedKind = (typeof NORMALIZED_KINDS)[number];

/** Provider-agnostic normalized payload: canonical metrics + dimensions. */
export type NormalizedPayload = {
  kind: NormalizedKind;
  entity: string;                       // e.g. "campaign:launch", "keyword:ai cmo"
  metrics: Record<string, number>;      // canonical metric names
  dimensions: Record<string, string>;   // canonical labels (channel, audience, platform…)
  occurredAt: number;
};

export type BusinessEvent = {
  id: string;
  tenant: string;                       // workspace key
  connector: ConnectorId;
  timestamp: number;
  source: string;                       // provider entity/source id
  entity: string;                       // business entity the event concerns
  type: BusinessEventType;
  payload: Record<string, unknown>;     // raw provider-shaped payload
  normalizedPayload: NormalizedPayload; // provider-agnostic
  confidence: number;                   // 0..1
  version: number;
};

// ---- Connector interface (Part 2) ----

export type ConnectorCapabilities = {
  id: ConnectorId;
  label: string;
  category: ConnectorCategory;
  oauth: boolean;
  polling: boolean;
  webhooks: boolean;
  incremental: boolean;
  historical: boolean;
  rateLimitPerMin: number;
  version: string;
};

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

export type ConnectorHealth = { id: ConnectorId; healthy: boolean; latencyMs: number; detail?: string };

export type ConnectorStatus = {
  id: ConnectorId;
  state: ConnectionState;
  lastSyncAt: number | null;
  nextSyncAt: number | null;
  cursor: number;                       // incremental sync cursor
  eventsProduced: number;
  errors: number;
  version: string;
};

export type PollResult = { events: BusinessEvent[]; cursor: number };

export type SyncEstimate = { records: number; durationMs: number };

/**
 * A connector (platform adapter). Interchangeable — real providers implement the same
 * interface and drop in with zero changes to business logic. No business logic inside.
 */
export interface Connector {
  readonly id: ConnectorId;
  capabilities(): ConnectorCapabilities;
  connect(auth?: Record<string, unknown>): Promise<ConnectorStatus>;
  disconnect(): Promise<ConnectorStatus>;
  refresh(): Promise<ConnectorStatus>;          // refresh OAuth / re-auth
  health(): Promise<ConnectorHealth>;
  status(): ConnectorStatus;
  poll(opts?: { tenant: string; cursor?: number; historical?: boolean }): Promise<PollResult>;
  handleWebhook(payload: Record<string, unknown>, tenant: string): BusinessEvent[];
  /** Turn a raw provider record into a normalized payload (pure). */
  normalize(type: BusinessEventType, raw: Record<string, unknown>): NormalizedPayload;
  estimateSync(opts?: { historical?: boolean }): SyncEstimate;
  supportedEvents(): BusinessEventType[];
}

// ---- Sync engine tracking (Part 8) ----

export type SyncMode = "scheduled" | "manual" | "incremental" | "historical";

export type SyncRun = {
  id: string;
  connector: ConnectorId;
  tenant: string;
  mode: SyncMode;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  recordsProcessed: number;
  eventsPublished: number;
  errors: number;
  ok: boolean;
};
