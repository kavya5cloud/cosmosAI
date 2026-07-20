import { type Sql, RUNTIME_DDL } from "@/lib/db";
import type { DecisionAccuracy, DecisionFeedback } from "./types";
import { clamp01, idFrom, round } from "./util";

// Decision Feedback Loop (Part 7) — closes the loop on the Decision Planner. For each
// decision we recorded a PREDICTION (expected impact/confidence); once the campaign runs
// we compare it to the ACTUAL measured performance. Deviation + quality accumulate so
// planner accuracy is measurable and improves over time. Deterministic; no LLM.

export function recordDecisionFeedback(input: {
  decisionId: string; channel: string;
  predictedImpact: number; predictedConfidence: number; actualPerformance: number; at?: number;
}): DecisionFeedback {
  const predicted = clamp01(input.predictedImpact);
  const actual = clamp01(input.actualPerformance);
  const deviation = round(Math.abs(predicted - actual));
  return {
    id: idFrom("dfb", input.decisionId, input.channel),
    decisionId: input.decisionId, channel: input.channel,
    predictedImpact: round(predicted), predictedConfidence: round(clamp01(input.predictedConfidence)),
    actualPerformance: round(actual), deviation, quality: round(1 - deviation), at: input.at ?? 0,
  };
}

/** Planner accuracy over a set of feedbacks, with a trend (recent half vs older half). */
export function decisionAccuracy(feedbacks: DecisionFeedback[]): DecisionAccuracy {
  if (feedbacks.length === 0) return { samples: 0, meanQuality: 0, meanDeviation: 0, trend: "flat" };
  const ordered = [...feedbacks].sort((a, b) => a.at - b.at);
  const meanQuality = round(ordered.reduce((s, f) => s + f.quality, 0) / ordered.length);
  const meanDeviation = round(ordered.reduce((s, f) => s + f.deviation, 0) / ordered.length);

  const half = Math.floor(ordered.length / 2);
  let trend: DecisionAccuracy["trend"] = "flat";
  if (half >= 1) {
    const older = ordered.slice(0, half);
    const recent = ordered.slice(ordered.length - half);
    const oq = older.reduce((s, f) => s + f.quality, 0) / older.length;
    const rq = recent.reduce((s, f) => s + f.quality, 0) / recent.length;
    if (rq - oq > 0.02) trend = "improving";
    else if (oq - rq > 0.02) trend = "declining";
  }
  return { samples: ordered.length, meanQuality, meanDeviation, trend };
}

// ---- Repository (in-memory + Neon) ----

export interface DecisionFeedbackStore {
  record(f: DecisionFeedback): Promise<DecisionFeedback>;
  list(): Promise<DecisionFeedback[]>;
  accuracy(): Promise<DecisionAccuracy>;
}

export class InMemoryDecisionFeedbackStore implements DecisionFeedbackStore {
  private items: DecisionFeedback[] = [];
  async record(f: DecisionFeedback) { this.items.push(f); return f; }
  async list() { return [...this.items]; }
  async accuracy() { return decisionAccuracy(this.items); }
}

let dfReady = false;
async function ensureDfTable(sql: Sql) {
  if (dfReady) return;
  if (!RUNTIME_DDL) { dfReady = true; return; }
  await sql`CREATE TABLE IF NOT EXISTS learn_decision_feedback (
    id TEXT PRIMARY KEY,
    decision_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    predicted_impact REAL NOT NULL,
    predicted_confidence REAL NOT NULL,
    actual_performance REAL NOT NULL,
    deviation REAL NOT NULL,
    quality REAL NOT NULL,
    at BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  dfReady = true;
}

export class NeonDecisionFeedbackStore implements DecisionFeedbackStore {
  constructor(private sql: Sql) {}
  async record(f: DecisionFeedback) {
    await ensureDfTable(this.sql);
    await this.sql`INSERT INTO learn_decision_feedback
      (id, decision_id, channel, predicted_impact, predicted_confidence, actual_performance, deviation, quality, at)
      VALUES (${f.id}, ${f.decisionId}, ${f.channel}, ${f.predictedImpact}, ${f.predictedConfidence},
              ${f.actualPerformance}, ${f.deviation}, ${f.quality}, ${f.at})
      ON CONFLICT (id) DO UPDATE SET actual_performance = EXCLUDED.actual_performance,
        deviation = EXCLUDED.deviation, quality = EXCLUDED.quality`;
    return f;
  }
  async list() {
    await ensureDfTable(this.sql);
    const rows = (await this.sql`SELECT * FROM learn_decision_feedback ORDER BY at`) as Record<string, unknown>[];
    return rows.map((r): DecisionFeedback => ({
      id: String(r.id), decisionId: String(r.decision_id), channel: String(r.channel),
      predictedImpact: Number(r.predicted_impact), predictedConfidence: Number(r.predicted_confidence),
      actualPerformance: Number(r.actual_performance), deviation: Number(r.deviation),
      quality: Number(r.quality), at: Number(r.at),
    }));
  }
  async accuracy() { return decisionAccuracy(await this.list()); }
}
