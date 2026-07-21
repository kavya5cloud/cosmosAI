// Global AI Processing experience — the standard loading UI across Populr. It always
// describes the marketing work in progress and never exposes a model or a generic spinner.

export { default as AIProcessing, type AIProcessingProps } from "./AIProcessing";
export { default as AIProgress } from "./AIProgress";
export { default as ProcessingStage } from "./ProcessingStage";
export { default as QueueStatus } from "./QueueStatus";
export { default as LoadingOverlay } from "./LoadingOverlay";
export { useAIProcessing, type UseAIProcessingInput, type AIProcessingState, type AIStatus } from "./useAIProcessing";
export { useJobProgress } from "./useJobProgress";
export {
  STAGE_SEQUENCES, PROGRESS_STATES, resolveRequestType, formatWait,
  type RequestType, type Stage, type ProgressPhase,
} from "./stages";
