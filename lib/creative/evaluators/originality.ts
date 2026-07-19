import type { CreativeSubject, EvaluationContext, EvaluatorResult } from "@/lib/creative/types";
import { clicheHits, contentWords, result, sentences, subjectText } from "./util";

// Originality — penalizes repetition (duplicate sentences, low lexical variety) and
// cliché density. Deterministic — no external corpus, just self-similarity signals.
export function originality(subject: CreativeSubject, _ctx: EvaluationContext): EvaluatorResult {
  const text = subjectText(subject);
  const cw = contentWords(text);
  if (cw.length === 0) {
    return result("originality", 0.3, 0.4, "Not enough content to judge originality.", ["Add substantive copy."]);
  }

  const uniqueRatio = new Set(cw).size / cw.length; // lexical variety
  const sents = sentences(text).map((s) => s.toLowerCase().replace(/\s+/g, " ").trim());
  const dupSentences = sents.length - new Set(sents).size;
  const cliches = clicheHits(text);

  const score = uniqueRatio * 0.7 + 0.3 - Math.min(0.3, dupSentences * 0.15) - Math.min(0.3, cliches.length * 0.1);

  const recs: string[] = [];
  if (uniqueRatio < 0.5) recs.push("Vary word choice — the copy repeats itself.");
  if (dupSentences > 0) recs.push(`${dupSentences} duplicated sentence(s) — rewrite or remove.`);
  if (cliches.length) recs.push(`Replace clichés: ${cliches.slice(0, 3).join(", ")}.`);
  if (!recs.length) recs.push("Fresh, varied phrasing.");

  return result(
    "originality",
    score,
    0.7,
    `Lexical variety ${(uniqueRatio * 100) | 0}%, ${dupSentences} duplicate sentence(s), ${cliches.length} cliché(s).`,
    recs
  );
}
