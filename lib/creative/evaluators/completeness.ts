import type { CreativeSubject, EvaluationContext, EvaluatorResult } from "@/lib/creative/types";
import { coverage, result, subjectText, tokenSet, words } from "./util";

// Completeness — does the asset contain the essential parts (a hook, the message,
// some proof, and a call to action)? Deterministic presence checks.
export function completeness(subject: CreativeSubject, ctx: EvaluationContext): EvaluatorResult {
  const text = subjectText(subject);
  const bodyTokens = tokenSet(text);
  const wc = words(text).length;

  const hasHook = !!(subject.title && subject.title.trim().length >= 3) || wc >= 12;
  const hasMessage = coverage(tokenSet(ctx.brief.keyMessage), bodyTokens) >= 0.25;
  const hasProof = coverage(tokenSet(ctx.brief.proof), bodyTokens) >= 0.25 || /\b\d/.test(text);
  const ctaTokens = tokenSet(ctx.brief.cta);
  const hasCta = (ctaTokens.size > 0 && coverage(ctaTokens, bodyTokens) >= 0.5)
    || /\b(sign up|get started|try|book|join|learn more|download|start|subscribe|contact)\b/i.test(text);

  const parts = [hasHook, hasMessage, hasProof, hasCta];
  const score = parts.filter(Boolean).length / parts.length;

  const recs: string[] = [];
  if (!hasHook) recs.push("Add a clear hook / headline.");
  if (!hasMessage) recs.push("State the key message explicitly.");
  if (!hasProof) recs.push("Back the claim with proof or a concrete detail.");
  if (!hasCta) recs.push("End with a call to action.");
  if (!recs.length) recs.push("All essential parts present (hook, message, proof, CTA).");

  return result(
    "completeness",
    score,
    0.8,
    `Present — hook:${hasHook} message:${hasMessage} proof:${hasProof} cta:${hasCta}.`,
    recs
  );
}
