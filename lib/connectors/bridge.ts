import type { PlatformId } from "@/lib/publishing/types";
import { normalizePerformanceEvent } from "@/lib/learning/performance";
import type { PerformanceEvent } from "@/lib/learning/types";
import type { BusinessEventBus } from "./event-bus";
import type { BusinessEvent, ConnectorId, NormalizedKind } from "./types";

// Downstream bridge — the CONSUMER side of the Business Event contract. The Learning
// Engine, Business Graph and Decision Planner SUBSCRIBE to Business Events here; connectors
// never write to them. This is the only place normalized events cross into the rest of
// Populr, and it consumes normalized payloads only (never raw provider shapes).

const CONNECTOR_PLATFORM: Partial<Record<ConnectorId, PlatformId>> = {
  linkedin: "linkedin", x: "x", youtube: "youtube", tiktok: "tiktok",
  meta_ads: "facebook", google_ads: "website", google_analytics: "website",
  google_search_console: "website", shopify: "website", stripe: "email",
};

// Normalized kinds that carry per-subject performance the Learning Engine can learn from.
const LEARNABLE: NormalizedKind[] = ["campaign", "social", "performance", "seo", "traffic"];

/** Map a Business Event's NORMALIZED payload to a Learning PerformanceEvent (or null). */
export function businessEventToPerformance(e: BusinessEvent): PerformanceEvent | null {
  const np = e.normalizedPayload;
  if (!LEARNABLE.includes(np.kind)) return null;
  if (Object.keys(np.metrics).length === 0) return null;
  const platform = CONNECTOR_PLATFORM[e.connector] ?? "website";
  // normalizePerformanceEvent canonicalizes metric aliases into the Learning metric schema.
  return normalizePerformanceEvent({
    id: e.id,
    assetKey: `${e.connector}:${np.entity}`,
    platform,
    audience: np.dimensions.audience ?? null,
    at: np.occurredAt || e.timestamp,
    metrics: np.metrics,
  });
}

/**
 * A downstream collector that subscribes to the bus. It buffers Learning performance
 * events and counts Business-Graph-relevant signals — event-driven, no direct writes. A
 * consumer flushes the buffer into the real engines (e.g. LearningEngine.ingest).
 */
export class DownstreamCollector {
  private performance: PerformanceEvent[] = [];
  private graphSignals: BusinessEvent[] = [];
  private detachers: Array<() => void> = [];

  attach(bus: BusinessEventBus): this {
    // Learning Engine subscriber
    this.detachers.push(bus.subscribe("learning-engine", (e) => {
      const pe = businessEventToPerformance(e);
      if (pe) this.performance.push(pe);
    }));
    // Business Graph subscriber (revenue/lead/customer signals enrich the graph)
    this.detachers.push(bus.subscribe("business-graph", (e) => {
      if (["revenue", "lead", "customer", "seo"].includes(e.normalizedPayload.kind)) this.graphSignals.push(e);
    }));
    return this;
  }

  detach() { for (const d of this.detachers) d(); this.detachers = []; }

  learningBatch(): PerformanceEvent[] { return [...this.performance]; }
  graphBatch(): BusinessEvent[] { return [...this.graphSignals]; }
  reset() { this.performance = []; this.graphSignals = []; }
}
