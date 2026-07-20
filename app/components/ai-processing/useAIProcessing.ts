"use client";
import { useEffect, useRef, useState } from "react";
import {
  resolveRequestType, STAGE_SEQUENCES, type ProgressPhase, type RequestType, type Stage,
} from "./stages";

export type AIStatus = "queued" | "processing" | "completed";

export type UseAIProcessingInput = {
  /** Feature or request type — decides the stage sequence. */
  requestType: string | RequestType;
  /** Whether processing is active (the request is in flight). */
  active: boolean;
  /** Backend-provided status. "queued" shows the high-demand experience. */
  status?: AIStatus;
  /** Real progress 0..1 from the backend. If given, simulation is disabled. */
  progress?: number;
  /** Set true when the request finishes — the UI completes and settles. */
  complete?: boolean;
  /** Estimated total seconds — paces the simulated progress + queue wait. */
  estimatedTime?: number;
  /** Position in the queue, when known. */
  queuePosition?: number;
};

export type AIProcessingState = {
  type: RequestType;
  stages: Stage[];
  activeIndex: number;   // index of the in-progress stage (stages.length when done)
  percent: number;       // 0..100
  phase: ProgressPhase;
  isQueued: boolean;
  estimatedTime?: number;
  queuePosition?: number;
};

// The engine behind every AI loading experience. It either reflects real backend progress
// or simulates believable progress through the stage sequence, holding on the final stage
// until completion so it never "finishes" before the work does.
export function useAIProcessing(input: UseAIProcessingInput): AIProcessingState {
  const type = resolveRequestType(input.requestType);
  const stages = STAGE_SEQUENCES[type];
  const isQueued = input.status === "queued";

  const [activeIndex, setActiveIndex] = useState(0);
  const iRef = useRef(0);

  // Reset when a new request starts.
  useEffect(() => {
    if (input.active && !input.complete) { iRef.current = 0; setActiveIndex(0); }
  }, [input.active, type]); // eslint-disable-line react-hooks/exhaustive-deps

  // Simulate progress when there's no real progress signal.
  useEffect(() => {
    if (!input.active || input.complete || isQueued || input.progress != null) return;
    const perStage = input.estimatedTime
      ? Math.max(650, (input.estimatedTime * 1000) / (stages.length + 1))
      : 1500;
    const timer = setInterval(() => {
      iRef.current += 1;
      if (iRef.current >= stages.length - 1) {
        setActiveIndex(stages.length - 1); // hold on the last stage until complete
        clearInterval(timer);
      } else {
        setActiveIndex(iRef.current);
      }
    }, perStage);
    return () => clearInterval(timer);
  }, [input.active, input.complete, isQueued, input.progress, input.estimatedTime, stages.length]);

  // Completion settles the UI on the final stage.
  const done = !!input.complete;

  let idx: number;
  let percent: number;
  if (done) {
    idx = stages.length;
    percent = 100;
  } else if (input.progress != null) {
    const p = Math.max(0, Math.min(1, input.progress));
    idx = Math.min(stages.length - 1, Math.floor(p * stages.length));
    percent = Math.round(p * 100);
  } else {
    idx = activeIndex;
    // Asymptotic: never claim more than 94% until the work actually completes.
    percent = Math.min(94, Math.round(((activeIndex + 0.5) / stages.length) * 100));
  }

  const phase: ProgressPhase = isQueued
    ? "queued"
    : done
      ? "completed"
      : idx <= 0 ? "preparing"
        : idx >= stages.length - 1 ? "finalizing"
          : idx === 1 ? "planning"
            : "generating";

  return {
    type, stages, activeIndex: idx, percent, phase, isQueued,
    estimatedTime: input.estimatedTime, queuePosition: input.queuePosition,
  };
}
