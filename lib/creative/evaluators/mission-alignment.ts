import type { CreativeSubject, EvaluationContext, EvaluatorResult } from "@/lib/creative/types";
import { coverage, result, subjectText, tokenSet } from "./util";

// Mission Alignment — is the asset pulling toward the mission/objective, or drifting?
export function missionAlignment(subject: CreativeSubject, ctx: EvaluationContext): EvaluatorResult {
  const text = subjectText(subject);
  const mission = tokenSet(`${ctx.mission ?? ""} ${ctx.brief.objective}`);
  const bodyTokens = tokenSet(text);

  const cov = coverage(mission, bodyTokens);
  const score = cov * 0.85 + 0.15;
  const confidence = mission.size >= 3 ? 0.8 : 0.4;

  const recs: string[] = [];
  if (cov < 0.2) recs.push(`Tie the copy back to the mission objective: "${ctx.brief.objective || ctx.mission || "n/a"}".`);
  else recs.push("Clearly serves the mission objective.");

  return result(
    "mission_alignment",
    score,
    confidence,
    `Mission-objective coverage ${(cov * 100) | 0}%.`,
    recs
  );
}
