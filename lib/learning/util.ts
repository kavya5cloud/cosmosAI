// Deterministic helpers for the Learning Engine. No randomness, no I/O.

export function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

export function idFrom(prefix: string, ...parts: unknown[]): string {
  return `${prefix}_${hash(parts.map((p) => JSON.stringify(p)).join("|"))}`;
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function round(n: number, dp = 3): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Blend a prior value toward an observation, weighted by accumulated evidence.
 *  Deterministic Bayesian-ish update: more evidence → slower to move. */
export function blend(prior: number, observation: number, priorEvidence: number, obsWeight = 1): number {
  const total = priorEvidence + obsWeight;
  return clamp01((prior * priorEvidence + observation * obsWeight) / (total || 1));
}
