import type { CmoContext } from "@/lib/services/cmo-context";
import { buildCmoPrompt } from "@/lib/services/cmo-context";

// Strategy Engine — the ONLY engine that shows reasoning (recommendation, trade-offs,
// evidence, confidence, channel ranking). It reuses the decide-first CMO prompt, which
// already grounds the answer in the shared Business State.

export function buildStrategyPrompt(ctx: CmoContext, question: string, recentTurns: string): string {
  return buildCmoPrompt(ctx, question, "strategy", recentTurns);
}
