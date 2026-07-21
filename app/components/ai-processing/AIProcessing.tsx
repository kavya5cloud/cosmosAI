"use client";
import { useEffect, useRef } from "react";
import { useAIProcessing, type UseAIProcessingInput } from "./useAIProcessing";
import { useJobProgress } from "./useJobProgress";
import AIProgress from "./AIProgress";
import ProcessingStage, { type StageState } from "./ProcessingStage";
import QueueStatus from "./QueueStatus";

export type AIProcessingProps = UseAIProcessingInput & {
  /** Optional heading, e.g. "Building your launch". Defaults to a work-focused label. */
  title?: string;
  /** "inline" (embeds in a panel) or "overlay" (full card, used by LoadingOverlay). */
  variant?: "inline" | "overlay";
  className?: string;
  /** When set, progress is driven by REAL job execution (polls /api/jobs/{id}), not simulated. */
  jobId?: string | null;
  /** Fires once when the work reaches the completed phase (e.g. to auto-close an overlay). */
  onComplete?: () => void;
};

const DEFAULT_TITLE: Record<string, string> = {
  general: "Working on your answer",
  strategy: "Building your strategy",
  launch: "Planning your launch",
  creative: "Creating your assets",
  video: "Producing your video",
  document: "Writing your document",
};

// The standard AI processing experience. Renders the queue experience when queued,
// otherwise the animated progress bar + the request's real work stages. Works inline or
// inside the fullscreen overlay. Never shows a spinner or the word "loading".
export default function AIProcessing(props: AIProcessingProps) {
  // Real job progress wins over simulation whenever a job id is available (Part 12).
  const live = useJobProgress(props.jobId);
  const simulated = useAIProcessing(props);
  const s = live ?? simulated;
  const variant = props.variant ?? "inline";

  // Fire onComplete once when the work finishes (auto-close overlays, etc.).
  const firedComplete = useRef(false);
  useEffect(() => {
    if (s.phase === "completed" && !firedComplete.current) { firedComplete.current = true; props.onComplete?.(); }
    if (s.phase !== "completed") firedComplete.current = false;
  }, [s.phase, props]);

  if (s.isQueued) {
    return (
      <div className={`aip aip-${variant} ${props.className ?? ""}`}>
        <QueueStatus estimatedTime={s.estimatedTime} queuePosition={s.queuePosition} />
      </div>
    );
  }

  const title = props.title ?? DEFAULT_TITLE[s.type] ?? "Working on it";
  const done = s.phase === "completed";

  return (
    <div className={`aip aip-${variant} ${props.className ?? ""}`} aria-live="polite" aria-busy={!done}>
      <div className="aip-head">
        <span className="aip-brandmark" aria-hidden="true">P</span>
        <div className="aip-head-text">
          <div className="aip-title">{title}</div>
          <div className="aip-sub">{done ? "Done" : "Populr is on it — a moment while the team works"}</div>
        </div>
        <div className="aip-pct">{s.percent}%</div>
      </div>

      <AIProgress percent={s.percent} done={done} />

      <div className="aip-stages">
        {s.stages.map((stage, i) => {
          const state: StageState = done || i < s.activeIndex ? "done" : i === s.activeIndex ? "active" : "pending";
          return <ProcessingStage key={stage.title} stage={stage} state={state} />;
        })}
      </div>
    </div>
  );
}
