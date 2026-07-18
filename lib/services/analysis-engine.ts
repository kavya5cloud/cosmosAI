import type { CmoContext } from "@/lib/services/cmo-context";
import { renderBriefing, confidenceOf } from "@/lib/services/cmo-context";

// Analysis Engine — diagnose and explain, grounded strictly in the Business State. It
// answers "why / what worked / what changed" from the data, and refuses to invent causes
// when the data isn't there. It explains (unlike Content), but stays evidence-bound
// (unlike a generic chatbot that would speculate freely).

export function buildAnalysisPrompt(ctx: CmoContext, question: string, recentTurns: string): string {
  const confidence = confidenceOf(ctx.signals);
  return `You are the analyst for ${ctx.business.name || "this business"}. Answer the question using ONLY the business state below. This is diagnosis, not strategy — explain what the data shows.

=== BUSINESS STATE ===
${renderBriefing(ctx)}
=== END STATE ===

EVIDENCE: ${confidence.toUpperCase()}.
Rules:
- Explain what the data actually shows. Cite the specific metric/outcome/mission.
- If the data can't explain it, say so plainly and name what you'd need to measure — never invent a cause.
- Be concise: lead with the finding, then the supporting evidence. No generic marketing lecture.

Recent conversation:
${recentTurns || "none"}

Question: ${question}`;
}
