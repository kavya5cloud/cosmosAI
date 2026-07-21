import type { Connector, ConnectorCapabilities, ConnectorHealth, ConnectorId } from "./types";
import { createReferenceConnectors } from "./connectors";

// Connector Registry (Part 3) — register connectors, look them up by capability, report
// health + rate limits, track versions and availability, and provide fallback within a
// category. The Sync Engine only ever talks to the registry.
export class ConnectorRegistry {
  private connectors = new Map<ConnectorId, Connector>();

  register(c: Connector): this { this.connectors.set(c.id, c); return this; }
  get(id: ConnectorId): Connector | null { return this.connectors.get(id) ?? null; }
  has(id: ConnectorId): boolean { return this.connectors.has(id); }
  list(): Connector[] { return [...this.connectors.values()]; }
  ids(): ConnectorId[] { return [...this.connectors.keys()]; }

  capabilities(): ConnectorCapabilities[] { return this.list().map((c) => c.capabilities()); }

  /** Connectors matching a capability flag. */
  withCapability(cap: "oauth" | "polling" | "webhooks" | "incremental" | "historical"): Connector[] {
    return this.list().filter((c) => c.capabilities()[cap]);
  }

  rateLimit(id: ConnectorId): number { return this.get(id)?.capabilities().rateLimitPerMin ?? 0; }
  version(id: ConnectorId): string | null { return this.get(id)?.capabilities().version ?? null; }

  async health(): Promise<ConnectorHealth[]> { return Promise.all(this.list().map((c) => c.health())); }

  /** A connected connector, or a fallback in the same category when the primary is down. */
  async available(id: ConnectorId): Promise<Connector | null> {
    const primary = this.get(id);
    if (primary && (await primary.health()).healthy && primary.status().state === "connected") return primary;
    const category = primary?.capabilities().category;
    for (const c of this.list()) {
      if (c.id === id || c.capabilities().category !== category) continue;
      if ((await c.health()).healthy && c.status().state === "connected") return c;
    }
    return primary;
  }
}

export function createDefaultRegistry(now: () => number = () => 0): ConnectorRegistry {
  const reg = new ConnectorRegistry();
  for (const c of createReferenceConnectors(now)) reg.register(c);
  return reg;
}
