// Learning Engine — deterministic intelligence that makes Populr measurably smarter after
// every campaign. Performance events in; structured intelligence out (patterns, brand DNA,
// business-graph signals, creative memory, decision feedback). No LLMs in this layer.

export * from "./types";
export { normalizePerformanceEvent, performanceScore, aggregatePerformance } from "./performance";
export {
  extractPatterns, searchPatterns, InMemoryPatternStore, NeonPatternStore,
  type PatternStore, type PatternQuery,
} from "./patterns";
export {
  emptyBrandDNA, evolveBrandDNA, InMemoryBrandDNAStore, NeonBrandDNAStore,
  type BrandDNAStore, type BrandObservation,
} from "./brand-dna";
export {
  evolveBusinessGraph, InMemoryBgSignalStore, NeonBgSignalStore, type BgSignalStore,
} from "./business-graph-evolution";
export {
  recordDecisionFeedback, decisionAccuracy, InMemoryDecisionFeedbackStore,
  NeonDecisionFeedbackStore, type DecisionFeedbackStore,
} from "./decision-feedback";
export { generateInsights } from "./insights";
export { LearningEngine, type LearningStores } from "./engine";
