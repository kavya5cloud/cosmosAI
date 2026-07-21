// AI Processing — the single source of truth for what Populr says it's doing while it
// works. Every stage describes real marketing work, never a model or "loading". Used by
// the useAIProcessing hook + the AIProcessing components across the whole app.

export type RequestType = "general" | "strategy" | "launch" | "creative" | "video" | "document";

export type Stage = { icon: string; title: string; hint: string };

/** Per-request-type stage sequences (from the product spec). */
export const STAGE_SEQUENCES: Record<RequestType, Stage[]> = {
  general: [
    { icon: "🧠", title: "Understanding your business", hint: "Reading your profile and goals" },
    { icon: "📊", title: "Reviewing your marketing context", hint: "Channels, history and what's worked" },
    { icon: "🎯", title: "Finding the best approach", hint: "Weighing the highest-leverage options" },
    { icon: "✨", title: "Preparing your response", hint: "Writing it up clearly" },
  ],
  strategy: [
    { icon: "🧠", title: "Understanding your goals", hint: "What growth looks like for you" },
    { icon: "📈", title: "Reviewing previous campaigns", hint: "What moved the numbers before" },
    { icon: "🎯", title: "Identifying growth opportunities", hint: "Where the upside is" },
    { icon: "📊", title: "Validating recommendations", hint: "Checking the evidence" },
    { icon: "✨", title: "Finalizing your strategy", hint: "Turning it into a plan" },
  ],
  launch: [
    { icon: "🚀", title: "Planning your launch", hint: "Objectives and sequencing" },
    { icon: "📅", title: "Building campaign timeline", hint: "Weeks, phases and dependencies" },
    { icon: "🎨", title: "Organizing creative assets", hint: "Every asset the launch needs" },
    { icon: "📣", title: "Preparing distribution", hint: "Channels and publishing plan" },
    { icon: "✨", title: "Finalizing your launch", hint: "Bringing it all together" },
  ],
  creative: [
    { icon: "🎨", title: "Understanding your creative brief", hint: "Audience, message and angle" },
    { icon: "📚", title: "Gathering brand context", hint: "Voice, visuals and what wins" },
    { icon: "🧠", title: "Building creative direction", hint: "The idea and structure" },
    { icon: "✨", title: "Preparing creative assets", hint: "Shaping the output" },
  ],
  video: [
    { icon: "🎬", title: "Planning the story", hint: "Beats, arc and message" },
    { icon: "🎭", title: "Building storyboard", hint: "Scenes and shots" },
    { icon: "🎥", title: "Preparing scenes", hint: "Framing each moment" },
    { icon: "🎨", title: "Rendering visuals", hint: "Bringing the frames to life" },
    { icon: "🔍", title: "Creative Director reviewing", hint: "Checking it's on-brand" },
    { icon: "✨", title: "Finalizing your video", hint: "Last polish" },
  ],
  document: [
    { icon: "📄", title: "Understanding the document", hint: "Purpose and audience" },
    { icon: "📚", title: "Gathering business context", hint: "Facts, proof and positioning" },
    { icon: "✍️", title: "Writing structured content", hint: "Section by section" },
    { icon: "🔍", title: "Reviewing quality", hint: "Clarity and accuracy" },
    { icon: "✨", title: "Finalizing your document", hint: "Formatting and polish" },
  ],
};

// High-level progress states (each with icon/title/description/animation class).
export type ProgressPhase =
  | "queued" | "preparing" | "planning" | "generating" | "reviewing" | "finalizing" | "completed";

export const PROGRESS_STATES: Record<ProgressPhase, { icon: string; title: string; description: string; anim: string }> = {
  queued:     { icon: "🧊", title: "Queued", description: "Safely in line", anim: "aip-anim-pulse" },
  preparing:  { icon: "🧠", title: "Preparing", description: "Getting your context together", anim: "aip-anim-pulse" },
  planning:   { icon: "🎯", title: "Planning", description: "Choosing the best approach", anim: "aip-anim-pulse" },
  generating: { icon: "✨", title: "Generating", description: "Doing the work", anim: "aip-anim-shimmer" },
  reviewing:  { icon: "🔍", title: "Reviewing", description: "Checking quality", anim: "aip-anim-pulse" },
  finalizing: { icon: "🎁", title: "Finalizing", description: "Putting it together", anim: "aip-anim-pulse" },
  completed:  { icon: "✅", title: "Completed", description: "Ready", anim: "" },
};

// Live mode — Job pipeline states → display stages (Part 12). Control states are excluded.
export const JOB_STATE_STAGE: Record<string, Stage> = {
  queued: { icon: "🧊", title: "Queued", hint: "Safely in line" },
  waiting_for_resources: { icon: "⏳", title: "Waiting for resources", hint: "Allocating capacity" },
  planning: { icon: "🎯", title: "Planning", hint: "Choosing the approach" },
  creative_intelligence: { icon: "🧠", title: "Creative Intelligence", hint: "Building the specification" },
  generating: { icon: "✨", title: "Generating", hint: "Producing the asset" },
  creative_director_review: { icon: "🔍", title: "Creative Director review", hint: "Checking it's on-brand" },
  approval: { icon: "✅", title: "Approval", hint: "Signing off" },
  publishing: { icon: "📣", title: "Publishing", hint: "Distributing" },
  learning_update: { icon: "📈", title: "Learning", hint: "Getting smarter from the outcome" },
  completed: { icon: "🎉", title: "Completed", hint: "Ready" },
};

/** Build the display stage list for a live job from its concrete pipeline states. */
export function jobDisplayStages(states: string[]): Stage[] {
  return states.map((s) => JOB_STATE_STAGE[s]).filter(Boolean);
}

// Map any product feature to the right stage sequence, so callers can pass a feature name.
const FEATURE_ALIASES: Record<string, RequestType> = {
  chat: "general", general: "general", ask: "general",
  strategy: "strategy", decision: "strategy", planner: "strategy", "decision-planner": "strategy",
  launch: "launch", publishing: "launch", publish: "launch",
  creative: "creative", studio: "creative", image: "creative", images: "creative",
  motion: "creative", "motion-graphics": "creative", ugc: "creative", "creative-director": "creative", ads: "creative",
  video: "video", videos: "video",
  document: "document", documents: "document", doc: "document",
};

export function resolveRequestType(feature: string | RequestType): RequestType {
  return FEATURE_ALIASES[feature] ?? (STAGE_SEQUENCES[feature as RequestType] ? (feature as RequestType) : "general");
}

/** Format an estimated wait for the high-demand experience. */
export function formatWait(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} seconds`;
  const m = Math.round(seconds / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}
