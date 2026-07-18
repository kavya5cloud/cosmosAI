import { createHash } from "node:crypto";
import type { Sql } from "@/lib/db";
import type { BusinessGraph } from "@/lib/business-graph";
import type { CmoResponse, DecisionArtifact, EvidenceFact } from "@/lib/cmo/contracts";

export const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex");

export async function readCachedCmoResponse(sql: Sql, cacheKey: string): Promise<CmoResponse | null> {
  const rows = (await sql`
    SELECT response FROM cmo_response_cache
    WHERE cache_key = ${cacheKey} AND expires_at > now()`) as { response: CmoResponse }[];
  return rows[0]?.response ?? null;
}

export async function writeCachedCmoResponse(sql: Sql, cacheKey: string, workspaceKey: string, graphVersion: string, response: CmoResponse): Promise<void> {
  await sql`
    INSERT INTO cmo_response_cache (cache_key, workspace_key, graph_version, response, expires_at)
    VALUES (${cacheKey}, ${workspaceKey}, ${graphVersion}, ${JSON.stringify(response)}, now() + interval '60 seconds')
    ON CONFLICT (cache_key) DO UPDATE SET response = EXCLUDED.response, expires_at = EXCLUDED.expires_at, created_at = now()`;
}

export async function persistGraph(sql: Sql, graph: BusinessGraph): Promise<void> {
  await sql`
    INSERT INTO business_graph_snapshots (workspace_key, version, graph, projected_at)
    VALUES (${graph.workspaceKey}, ${graph.version}, ${JSON.stringify(graph)}, now())
    ON CONFLICT (workspace_key) DO UPDATE SET version = EXCLUDED.version, graph = EXCLUDED.graph, projected_at = now()`;
}

export async function persistDecision(sql: Sql, workspaceKey: string, graphVersion: string, requestKind: string, request: string, decision: DecisionArtifact, evidence: EvidenceFact[]): Promise<string> {
  const rows = (await sql`
    INSERT INTO decision_artifacts (workspace_key, graph_version, request_kind, request_fingerprint, artifact, evidence)
    VALUES (${workspaceKey}, ${graphVersion}, ${requestKind}, ${fingerprint(request)}, ${JSON.stringify(decision)}, ${JSON.stringify(evidence)})
    RETURNING id`) as { id: string }[];
  const id = rows[0].id;
  await sql`INSERT INTO decision_events (decision_artifact_id, event, payload) VALUES (${id}, 'created', ${JSON.stringify({ graphVersion })})`;
  return id;
}

/** Append an event to a decision artifact's log (append-only). */
export async function appendDecisionEvent(sql: Sql, decisionArtifactId: string, event: string, payload: Record<string, unknown> = {}): Promise<void> {
  await sql`INSERT INTO decision_events (decision_artifact_id, event, payload)
            VALUES (${decisionArtifactId}, ${event}, ${JSON.stringify(payload)})`;
}
