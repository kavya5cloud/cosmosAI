import { type Sql, RUNTIME_DDL } from "@/lib/db";
import { BRAND_TRAITS, type BrandDNA, type BrandTrait, type BrandTraitValue } from "./types";
import { blend, round } from "./util";

// Brand DNA Evolution (Part 4) — the brand's learned identity (tone, writing style, visual
// language, typography, color usage, motion style, messaging, vocabulary). It EVOLVES:
// each observation updates confidence deterministically and mints a NEW version. Prior
// versions are never overwritten. No LLM.

export type BrandObservation = { trait: BrandTrait; value: string; performance: number };

/** A blank Brand DNA (version 0) for a workspace. */
export function emptyBrandDNA(workspaceKey: string): BrandDNA {
  const traits = Object.fromEntries(
    BRAND_TRAITS.map((t) => [t, { value: "", confidence: 0, evidence: 0 } as BrandTraitValue])
  ) as Record<BrandTrait, BrandTraitValue>;
  return { workspaceKey, version: 0, traits, updatedAt: 0 };
}

/**
 * Evolve Brand DNA from observations. Returns a NEW version (never mutates the input).
 * A trait adopts a new value only when the observation outperforms the current confidence;
 * confidence blends toward the observed performance, weighted by accumulated evidence.
 */
export function evolveBrandDNA(current: BrandDNA, observations: BrandObservation[], at = 0): BrandDNA {
  const traits: Record<BrandTrait, BrandTraitValue> = { ...current.traits };
  // Aggregate observations per trait (best performance wins the value).
  const byTrait = new Map<BrandTrait, BrandObservation[]>();
  for (const o of observations) (byTrait.get(o.trait) ?? byTrait.set(o.trait, []).get(o.trait)!).push(o);

  for (const [trait, obs] of byTrait) {
    const prev = current.traits[trait];
    const best = [...obs].sort((a, b) => b.performance - a.performance)[0];
    const nextConfidence = round(blend(prev.confidence, best.performance, prev.evidence, obs.length));
    // Adopt the higher-performing value; keep the prior value if it's still stronger.
    const adopt = best.performance >= prev.confidence || !prev.value;
    traits[trait] = {
      value: adopt ? best.value : prev.value,
      confidence: nextConfidence,
      evidence: prev.evidence + obs.length,
    };
  }

  return { workspaceKey: current.workspaceKey, version: current.version + 1, traits, updatedAt: at };
}

// ---- Repository: every version is kept (in-memory + Neon) ----

export interface BrandDNAStore {
  save(dna: BrandDNA): Promise<BrandDNA>;
  latest(workspaceKey: string): Promise<BrandDNA | null>;
  versions(workspaceKey: string): Promise<BrandDNA[]>;
}

export class InMemoryBrandDNAStore implements BrandDNAStore {
  private byWs = new Map<string, BrandDNA[]>();
  async save(dna: BrandDNA) {
    const arr = this.byWs.get(dna.workspaceKey) ?? this.byWs.set(dna.workspaceKey, []).get(dna.workspaceKey)!;
    arr.push(dna);
    return dna;
  }
  async latest(workspaceKey: string) {
    const arr = this.byWs.get(workspaceKey);
    return arr && arr.length ? arr[arr.length - 1] : null;
  }
  async versions(workspaceKey: string) { return [...(this.byWs.get(workspaceKey) ?? [])]; }
}

let brandReady = false;
async function ensureBrandTable(sql: Sql) {
  if (brandReady) return;
  if (!RUNTIME_DDL) { brandReady = true; return; }
  await sql`CREATE TABLE IF NOT EXISTS learn_brand_dna (
    workspace_key TEXT NOT NULL,
    version INT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_key, version)
  )`;
  brandReady = true;
}

export class NeonBrandDNAStore implements BrandDNAStore {
  constructor(private sql: Sql) {}
  async save(dna: BrandDNA) {
    await ensureBrandTable(this.sql);
    await this.sql`INSERT INTO learn_brand_dna (workspace_key, version, data)
      VALUES (${dna.workspaceKey}, ${dna.version}, ${JSON.stringify(dna)}::jsonb)
      ON CONFLICT (workspace_key, version) DO UPDATE SET data = EXCLUDED.data`;
    return dna;
  }
  async latest(workspaceKey: string) {
    await ensureBrandTable(this.sql);
    const rows = (await this.sql`SELECT data FROM learn_brand_dna WHERE workspace_key = ${workspaceKey} ORDER BY version DESC LIMIT 1`) as { data: BrandDNA }[];
    return rows[0]?.data ?? null;
  }
  async versions(workspaceKey: string) {
    await ensureBrandTable(this.sql);
    const rows = (await this.sql`SELECT data FROM learn_brand_dna WHERE workspace_key = ${workspaceKey} ORDER BY version`) as { data: BrandDNA }[];
    return rows.map((r) => r.data);
  }
}
