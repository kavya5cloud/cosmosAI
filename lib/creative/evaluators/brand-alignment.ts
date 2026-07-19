import type { CreativeSubject, EvaluationContext, EvaluatorResult } from "@/lib/creative/types";
import { clicheHits, coverage, result, subjectText, tokenSet } from "./util";

// Brand Alignment — does the copy sound like THIS brand (its emotional angle and
// visual/voice direction) rather than generic AI marketing filler?
export function brandAlignment(subject: CreativeSubject, ctx: EvaluationContext): EvaluatorResult {
  const text = subjectText(subject);
  const voice = tokenSet(`${ctx.brief.emotionalAngle} ${ctx.brief.visualDirection}`);
  const bodyTokens = tokenSet(text);

  const voiceCoverage = coverage(voice, bodyTokens); // how much brand voice shows up
  const cliches = clicheHits(text);
  const clichePenalty = Math.min(0.6, cliches.length * 0.2);

  // Generic filler is THE brand killer, so cliché-freeness is the baseline; echoing the
  // brand's voice is a bonus on top. Clean copy that simply doesn't reuse the brief's
  // literal voice words still reads as on-brand (medium), not a hard fail.
  const score = 0.6 + voiceCoverage * 0.4 - clichePenalty;
  const confidence = voice.size >= 3 ? 0.7 : 0.4; // lower when the brief gives little voice signal

  const recs: string[] = [];
  if (voiceCoverage < 0.25) recs.push(`Lean into the brand's emotional angle: "${ctx.brief.emotionalAngle || "n/a"}".`);
  if (cliches.length) recs.push(`Remove generic phrasing: ${cliches.slice(0, 3).join(", ")}.`);
  if (!recs.length) recs.push("On-brand voice — keep this register.");

  const reason = cliches.length
    ? `Detected ${cliches.length} generic phrase(s); brand-voice coverage ${(voiceCoverage * 100) | 0}%.`
    : `Brand-voice coverage ${(voiceCoverage * 100) | 0}% with no generic filler.`;

  return result("brand_alignment", score, confidence, reason, recs);
}
