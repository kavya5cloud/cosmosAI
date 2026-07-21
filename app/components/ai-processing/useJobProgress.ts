"use client";
import { useEffect, useRef, useState } from "react";
import { jobDisplayStages, type Stage } from "./stages";
import type { AIProcessingState } from "./useAIProcessing";

// Live job progress — polls /api/jobs/{id} and maps the REAL execution into the AI
// Processing display. When a job id is present the experience is driven by real backend
// events (never simulated). Falls back to SSE-agnostic polling for broad compatibility.

const TERMINAL = ["completed", "cancelled", "failed", "timed_out"];

type JobProgressPayload = {
  state: string; percent: number; stages: string[];
  estimatedWaitMs?: number; queuePosition?: number; highDemand?: boolean;
};

export function useJobProgress(jobId: string | null | undefined): AIProcessingState | null {
  const [data, setData] = useState<JobProgressPayload | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!jobId) { setData(null); return; }
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        const d = await r.json();
        if (cancelled) return;
        if (d?.progress) {
          const p = d.progress as JobProgressPayload;
          setData(p);
          if (!TERMINAL.includes(p.state)) timer.current = setTimeout(poll, 800);
        } else {
          timer.current = setTimeout(poll, 1000);
        }
      } catch {
        if (!cancelled) timer.current = setTimeout(poll, 1500);
      }
    };
    poll();
    return () => { cancelled = true; if (timer.current) clearTimeout(timer.current); };
  }, [jobId]);

  if (!jobId || !data) return null;

  const stages: Stage[] = jobDisplayStages(data.stages);
  const isQueued = data.state === "queued" || data.state === "waiting_for_resources";
  const done = data.state === "completed";
  // active index = the stage matching the current state (or the last for terminal).
  const displayStates = data.stages;
  let activeIndex = displayStates.indexOf(data.state);
  if (done) activeIndex = stages.length;
  if (activeIndex < 0) activeIndex = 0;

  return {
    type: "general",
    stages,
    activeIndex,
    percent: data.percent,
    phase: done ? "completed" : isQueued ? "queued" : "generating",
    isQueued,
    estimatedTime: data.estimatedWaitMs != null ? Math.round(data.estimatedWaitMs / 1000) : undefined,
    queuePosition: data.queuePosition,
  };
}
