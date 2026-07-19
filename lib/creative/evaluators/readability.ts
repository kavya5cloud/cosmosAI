import type { CreativeSubject, EvaluationContext, EvaluatorResult } from "@/lib/creative/types";
import { result, sentences, subjectText, words } from "./util";

// Readability — deterministic proxy for how easily the audience can scan the copy.
// Rewards moderate sentence length and shorter words; penalizes wall-of-text sentences.
export function readability(subject: CreativeSubject, _ctx: EvaluationContext): EvaluatorResult {
  const text = subjectText(subject);
  const sents = sentences(text);
  const wordList = words(text);
  if (sents.length === 0 || wordList.length === 0) {
    return result("readability", 0.2, 0.4, "No readable sentences found.", ["Add real sentence content."]);
  }

  const avgWordsPerSentence = wordList.length / sents.length;
  const longWords = wordList.filter((w) => w.length >= 12).length;
  const longWordRatio = longWords / wordList.length;
  const longSentences = sents.filter((s) => words(s).length > 28).length;

  // Ideal ~ 8–22 words/sentence. Penalize deviation and heavy long-word density.
  const lenPenalty = avgWordsPerSentence <= 22 ? Math.max(0, (avgWordsPerSentence - 22) / 30)
    : (avgWordsPerSentence - 22) / 22;
  const score = 1 - Math.min(0.6, Math.max(0, lenPenalty)) - Math.min(0.3, longWordRatio * 1.5) - Math.min(0.2, longSentences * 0.05);

  const recs: string[] = [];
  if (avgWordsPerSentence > 24) recs.push(`Shorten sentences (avg ${avgWordsPerSentence.toFixed(0)} words) — break them up.`);
  if (longWordRatio > 0.15) recs.push("Swap some long/complex words for plainer ones.");
  if (longSentences > 0) recs.push(`${longSentences} sentence(s) run very long — split them.`);
  if (!recs.length) recs.push("Reads cleanly and scans well.");

  return result(
    "readability",
    score,
    0.75,
    `Avg ${avgWordsPerSentence.toFixed(1)} words/sentence, ${(longWordRatio * 100) | 0}% long words.`,
    recs
  );
}
