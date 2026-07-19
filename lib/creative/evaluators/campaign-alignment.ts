import type { CreativeSubject, EvaluationContext, EvaluatorResult } from "@/lib/creative/types";
import { coverage, result, subjectText, tokenSet } from "./util";

// Campaign Alignment — does the asset carry the campaign's key message and CTA?
export function campaignAlignment(subject: CreativeSubject, ctx: EvaluationContext): EvaluatorResult {
  const text = subjectText(subject);
  const lc = text.toLowerCase();
  const message = tokenSet(`${ctx.brief.keyMessage} ${ctx.campaign?.title ?? ""}`);
  const bodyTokens = tokenSet(text);

  const messageCoverage = coverage(message, bodyTokens);
  const ctaTokens = tokenSet(ctx.brief.cta);
  const ctaPresent = ctaTokens.size > 0 && coverage(ctaTokens, bodyTokens) >= 0.5;

  const score = messageCoverage * 0.7 + (ctaPresent ? 0.3 : 0.05);
  const confidence = message.size >= 3 ? 0.8 : 0.45;

  const recs: string[] = [];
  if (messageCoverage < 0.25) recs.push(`Surface the key message: "${ctx.brief.keyMessage || "n/a"}".`);
  if (!ctaPresent && ctx.brief.cta) recs.push(`Include the campaign CTA: "${ctx.brief.cta}".`);
  if (!recs.length) recs.push("Message and CTA are on-campaign.");

  return result(
    "campaign_alignment",
    score,
    confidence,
    `Key-message coverage ${(messageCoverage * 100) | 0}%; CTA ${ctaPresent ? "present" : "missing"}.`,
    recs
  );
}
