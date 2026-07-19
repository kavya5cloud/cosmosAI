import type { CreativeSubject, EvaluatorId, EvaluatorResult } from "@/lib/creative/types";

// Shared, deterministic text helpers for the Creative Director evaluators.
// No randomness, no network, no LLM — every function is a pure text measurement.

const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "for", "with", "is", "are",
  "be", "at", "by", "it", "this", "that", "your", "you", "we", "our", "as", "from", "will",
  "can", "has", "have", "not", "into", "so", "if", "then", "than", "just", "get", "more",
]);

export function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9']+/g) ?? []);
}

export function contentWords(text: string): string[] {
  return words(text).filter((w) => w.length > 2 && !STOP.has(w));
}

export function sentences(text: string): string[] {
  return text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

export function tokenSet(text: string): Set<string> {
  return new Set(contentWords(text));
}

/** Fraction of `needleTokens` that appear in `haystackTokens` (0..1). */
export function coverage(needle: Set<string>, haystack: Set<string>): number {
  if (needle.size === 0) return 0;
  let hit = 0;
  for (const t of needle) if (haystack.has(t)) hit++;
  return hit / needle.size;
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function round2(n: number): number {
  return Math.round(clamp01(n) * 100) / 100;
}

/** The full text of a subject: title + body + any string fields inside structure. */
export function subjectText(subject: CreativeSubject): string {
  const extra = subject.structure
    ? Object.values(subject.structure).filter((v) => typeof v === "string").join(" ")
    : "";
  return [subject.title ?? "", subject.body ?? "", extra].join(" ").trim();
}

/** Marketing clichés that read as generic AI filler — penalized by several evaluators. */
export const CLICHES = [
  "game changer", "game-changer", "revolutionary", "cutting edge", "cutting-edge",
  "best in class", "best-in-class", "unlock the power", "take it to the next level",
  "seamless", "synergy", "world class", "world-class", "elevate your", "supercharge",
  "in today's fast-paced world", "leverage", "paradigm", "next-generation", "one-stop shop",
];

export function clicheHits(text: string): string[] {
  const lc = text.toLowerCase();
  return CLICHES.filter((c) => lc.includes(c));
}

/** Build a well-formed EvaluatorResult with clamped/rounded numbers. */
export function result(
  evaluator: EvaluatorId,
  score: number,
  confidence: number,
  reason: string,
  recommendations: string[]
): EvaluatorResult {
  return { evaluator, score: round2(score), confidence: round2(confidence), reason, recommendations };
}
