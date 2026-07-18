import type { Sql } from "@/lib/db";
import { assembleCmoContext, type CmoContext, type CmoProfile } from "@/lib/services/cmo-context";
import { buildEvidencePack } from "@/lib/cmo/pipeline";
import type { EvidencePack } from "@/lib/cmo/contracts";
import { createHash } from "node:crypto";

// A versioned, evidence-backed projection of the workspace's canonical business state.
// The version is a content hash — the same state always produces the same version, so
// downstream caches and decision artifacts have a stable provenance key.
export type GraphEntity = {
  id: string;
  type: "business" | "goal" | "constraint" | "decision" | "outcome" | "channel" | "mission" | "campaign" | "asset";
  label: string;
  evidenceIds: string[];
};
export type GraphRelationship = {
  from: string;
  to: string;
  type: "pursues" | "constrained_by" | "prefers" | "measured_by" | "executes" | "contains";
};
export type BusinessGraph = {
  workspaceKey: string;
  version: string;
  generatedAt: string;
  evidence: EvidencePack;
  entities: GraphEntity[];
  relationships: GraphRelationship[];
};

export async function projectBusinessGraph(sql: Sql, workspaceKey: string, profile: CmoProfile, url: string, context?: CmoContext): Promise<BusinessGraph> {
  const ctx = context || (await assembleCmoContext(sql, workspaceKey, profile, url, false));
  const evidence = buildEvidencePack(ctx);
  const entities: GraphEntity[] = [
    { id: "business", type: "business", label: ctx.business.name || "Unknown business", evidenceIds: evidence.business.map((x) => x.id) },
    ...evidence.mission.map((x) => ({ id: x.id, type: "mission" as const, label: x.label, evidenceIds: [x.id] })),
    ...evidence.constraints.map((x) => ({ id: x.id, type: "constraint" as const, label: x.label, evidenceIds: [x.id] })),
    ...evidence.outcomes.map((x) => ({ id: x.id, type: "outcome" as const, label: x.label, evidenceIds: [x.id] })),
    ...evidence.channels.map((x) => ({ id: x.id, type: "channel" as const, label: x.label, evidenceIds: [x.id] })),
    ...evidence.creative.map((x) => ({ id: x.id, type: "asset" as const, label: x.label, evidenceIds: [x.id] })),
  ];
  const relationships: GraphRelationship[] = [
    ...evidence.mission.map((x) => ({ from: "business", to: x.id, type: "pursues" as const })),
    ...evidence.constraints.map((x) => ({ from: "business", to: x.id, type: "constrained_by" as const })),
    ...evidence.channels.map((x) => ({ from: "business", to: x.id, type: "prefers" as const })),
    ...evidence.outcomes.map((x) => ({ from: "business", to: x.id, type: "measured_by" as const })),
    ...evidence.creative.map((x) => ({ from: "business", to: x.id, type: "contains" as const })),
  ];
  const version = createHash("sha256").update(JSON.stringify({ evidence, entities, relationships })).digest("hex");
  return { workspaceKey, version, generatedAt: new Date().toISOString(), evidence, entities, relationships };
}
