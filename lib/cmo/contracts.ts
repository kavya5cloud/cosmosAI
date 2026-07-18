import type { Confidence, CmoContext } from "@/lib/services/cmo-context";
import type { RoutedIntent } from "@/lib/services/intent-router";

// Typed contracts for the CMO reasoning pipeline (evidence → decision → response).
export type EvidenceKind = "founder_stated" | "measured" | "observed" | "inferred" | "network_prior";

export type EvidenceFact = {
  id: string;
  kind: EvidenceKind;
  label: string;
  value: string;
  source: string;
  confidence: number;
  observedAt?: string;
};

export type EvidencePack = {
  business: EvidenceFact[];
  goals: EvidenceFact[];
  constraints: EvidenceFact[];
  history: EvidenceFact[];
  outcomes: EvidenceFact[];
  channels: EvidenceFact[];
  mission: EvidenceFact[];
  campaign: EvidenceFact[];
  creative: EvidenceFact[];
};

export type DecisionArtifact = {
  status: "recommended" | "needs_clarification" | "insufficient_evidence";
  recommendation: string;
  rankedOptions: { action: string; score: number; reason: string }[];
  tradeoffs: string[];
  evidenceIds: string[];
  uncertainty: { level: "low" | "medium" | "high"; missing: string[] };
  nextAction: string;
};

export type CmoResponse = {
  text: string;
  intent: RoutedIntent["intent"];
  confidence: Confidence;
  decision: DecisionArtifact;
  evidence: EvidenceFact[];
  cached: boolean;
};

export type CmoRequest = {
  wsid?: string;
  url?: string;
  profile?: CmoContext["business"];
  question: string;
  recentTurns?: string;
  source?: string;
  hasSelection?: boolean;
  target?: string;
};
