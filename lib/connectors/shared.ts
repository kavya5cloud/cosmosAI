import { ConnectorRegistry, createDefaultRegistry } from "./registry";
import { BusinessEventBus } from "./event-bus";
import { SyncEngine } from "./sync-engine";
import { DownstreamCollector } from "./bridge";

// Shared connector platform singleton for the API routes: one registry + event bus + sync
// engine + downstream collector per process. Downstream services subscribe once here.

export type ConnectorPlatform = {
  registry: ConnectorRegistry;
  bus: BusinessEventBus;
  sync: SyncEngine;
  collector: DownstreamCollector;
};

let platform: ConnectorPlatform | null = null;

export function connectorPlatform(): ConnectorPlatform {
  if (!platform) {
    const registry = createDefaultRegistry(Date.now);
    const bus = new BusinessEventBus();
    const sync = new SyncEngine(registry, bus, { now: Date.now });
    const collector = new DownstreamCollector().attach(bus); // Learning + Business Graph subscribe
    platform = { registry, bus, sync, collector };
  }
  return platform;
}
