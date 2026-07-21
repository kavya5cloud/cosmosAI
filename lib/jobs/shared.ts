import { db } from "@/lib/db";
import { JobEngine } from "./engine";
import { NeonJobStore } from "./store";

// Shared Job Engine singleton for the API routes. One process-wide engine holds the queue,
// workers and in-memory job state; when a database is present it also persists history
// through the Neon store. A real per-stage delay makes live progress advance believably so
// the AI Processing experience reflects real execution (never simulated).

let engine: JobEngine | null = null;

export function jobEngine(): JobEngine {
  if (!engine) {
    const sql = db();
    engine = new JobEngine({
      concurrency: 4,
      stageDelayMs: 700,
      store: sql ? new NeonJobStore(sql) : undefined,
    });
  }
  return engine;
}
