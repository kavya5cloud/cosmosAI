import type { Sql } from "@/lib/db";
import { NeonCreativeMemoryStore } from "@/lib/creative-intelligence/creative-memory";
import { LearningEngine } from "./engine";
import { NeonPatternStore } from "./patterns";
import { NeonBrandDNAStore } from "./brand-dna";
import { NeonBgSignalStore } from "./business-graph-evolution";
import { InMemoryDecisionFeedbackStore, NeonDecisionFeedbackStore, type DecisionFeedbackStore } from "./decision-feedback";

// Shared Learning Engine wiring for the API routes. With a database it uses the Neon
// stores (durable, versioned); without one it falls back to a process-level in-memory
// singleton so the endpoints still work in dev/preview.

let sharedEngine: LearningEngine | null = null;
let sharedFeedback: DecisionFeedbackStore | null = null;

export function learningEngine(sql: Sql | null): LearningEngine {
  if (sql) {
    return new LearningEngine({
      patterns: new NeonPatternStore(sql),
      brand: new NeonBrandDNAStore(sql),
      signals: new NeonBgSignalStore(sql),
      memory: new NeonCreativeMemoryStore(sql),
    });
  }
  if (!sharedEngine) sharedEngine = new LearningEngine();
  return sharedEngine;
}

export function feedbackStore(sql: Sql | null): DecisionFeedbackStore {
  if (sql) return new NeonDecisionFeedbackStore(sql);
  if (!sharedFeedback) sharedFeedback = new InMemoryDecisionFeedbackStore();
  return sharedFeedback;
}
