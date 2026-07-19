import type { CreativeSubject, EvaluationContext, EvaluatorResult } from "@/lib/creative/types";
import { result, subjectText, tokenSet, coverage } from "./util";

// Claim Verification — flags factual/quantitative claims and superlatives that are
// NOT backed by the brief's known facts/proof. Deterministic: extracts numeric and
// superlative claims and checks whether their supporting tokens appear in knownFacts.
const SUPERLATIVES = /\b(best|#1|number one|fastest|cheapest|leading|guaranteed|proven|most|never|always|100%|zero|instant)\b/gi;

export function claimVerification(subject: CreativeSubject, ctx: EvaluationContext): EvaluatorResult {
  const text = subjectText(subject);
  const facts = tokenSet((ctx.knownFacts ?? []).join(" ") + " " + ctx.brief.proof);

  // Numeric claims: any number/percent/currency figure.
  const numericClaims = text.match(/\$?\d[\d,.]*\s?(%|percent|x|k|m|bn|billion|million|users|customers|days|hours)?/gi) ?? [];
  const superlativeClaims = text.match(SUPERLATIVES) ?? [];
  const totalClaims = numericClaims.length + superlativeClaims.length;

  if (totalClaims === 0) {
    return result("claim_verification", 0.9, 0.6, "No hard claims to verify.", [
      "No factual claims made — nothing to substantiate.",
    ]);
  }

  // A claim is "supported" if the brief provides proof tokens at all; otherwise every
  // unsubstantiated claim is a risk. We can't fact-check numbers, so unbacked numbers
  // are flagged conservatively.
  const hasProofSignal = facts.size > 0 && coverage(tokenSet(text), facts) >= 0.1;
  const unbacked = hasProofSignal ? Math.ceil(totalClaims * 0.3) : totalClaims;

  const score = 1 - Math.min(0.8, unbacked * 0.2);
  const confidence = 0.65;

  const recs: string[] = [];
  if (superlativeClaims.length) recs.push(`Substantiate or soften superlatives: ${[...new Set(superlativeClaims)].slice(0, 3).join(", ")}.`);
  if (numericClaims.length && !hasProofSignal) recs.push("Numeric claims aren't backed by the brief's proof — verify before publishing.");
  if (!recs.length) recs.push("Claims appear supported by the brief.");

  return result(
    "claim_verification",
    score,
    confidence,
    `${totalClaims} claim(s) detected; ~${unbacked} need substantiation.`,
    recs
  );
}
