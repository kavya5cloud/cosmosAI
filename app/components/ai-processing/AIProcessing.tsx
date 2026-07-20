"use client";
import { useAIProcessing, type UseAIProcessingInput } from "./useAIProcessing";
import AIProgress from "./AIProgress";
import ProcessingStage, { type StageState } from "./ProcessingStage";
import QueueStatus from "./QueueStatus";

export type AIProcessingProps = UseAIProcessingInput & {
  /** Optional heading, e.g. "Building your launch". Defaults to a work-focused label. */
  title?: string;
  /** "inline" (embeds in a panel) or "overlay" (full card, used by LoadingOverlay). */
  variant?: "inline" | "overlay";
  className?: string;
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
  const s = useAIProcessing(props);
  const variant = props.variant ?? "inline";

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
