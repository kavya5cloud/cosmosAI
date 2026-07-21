// Integration & Connector Platform — the data ingestion layer. Connectors collect,
// normalize and publish Business Events; they never modify business objects. The Business
// Event is the only integration contract between external systems and the rest of Populr.

export * from "./types";
export { normalizePayload, NORMALIZED_FOR_EVENT } from "./normalize";
export { ReferenceConnector, createReferenceConnectors, CONNECTOR_SPECS } from "./connectors";
export { ConnectorRegistry, createDefaultRegistry } from "./registry";
export { BusinessEventBus, type BusinessEventHandler, type DeadLetter } from "./event-bus";
export { SyncEngine, type SyncEngineOptions } from "./sync-engine";
export { businessEventToPerformance, DownstreamCollector } from "./bridge";
export {
  InMemoryConnectorStore, NeonConnectorStore, type ConnectorStore,
} from "./store";
export { connectorPlatform } from "./shared";
