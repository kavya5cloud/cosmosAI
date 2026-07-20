# Global AI Processing Experience

The standard loading UI across Populr. It **never** shows a generic spinner or the words
"Loading / Thinking / Generating / Please wait", and it **never** names a model. Instead
it narrates the real marketing work in progress, so it feels like a professional team is
on the request.

## Where it lives — `app/components/ai-processing/`

| File | Purpose |
| ---- | ------- |
| `stages.ts` | The stage sequences per request type + progress states + `resolveRequestType` |
| `useAIProcessing.ts` | The hook — reflects real backend progress or simulates believable progress |
| `ProcessingStage.tsx` | One stage row (icon, title, hint, done/active/pending animation) |
| `AIProgress.tsx` | The animated progress bar (smooth width + shimmer, no spinner) |
| `QueueStatus.tsx` | The high-demand experience (never an error) |
| `AIProcessing.tsx` | The main component — inline or overlay |
| `LoadingOverlay.tsx` | Fullscreen version (portaled to `<body>`, viewport-centered) |
| `index.ts` | Barrel |

## The hook

```ts
const s = useAIProcessing({
  requestType,      // "general" | "strategy" | "launch" | "creative" | "video" | "document" (or a feature name)
  active,           // request in flight
  status,           // "queued" → shows the high-demand experience
  progress,         // 0..1 real progress (optional; disables simulation)
  complete,         // settles the UI when the work finishes
  estimatedTime,    // seconds — paces simulation + queue ETA
  queuePosition,    // shown when queued
});
// → { stages, activeIndex, percent, phase, isQueued }
```

If the backend streams progress, pass `progress`. Otherwise the hook simulates believable
progress through the stages and **holds on the final stage** until `complete` is set — it
never claims 100% before the work is done.

## Request types → stages

`general`, `strategy`, `launch`, `creative`, `video`, `document` each have their own stage
sequence (from the product spec). Any feature name (`chat`, `decision`, `image`, `motion`,
`ugc`, `publishing`, …) maps to the right sequence via `resolveRequestType`.

## Usage

```tsx
// Inline (chat, lightweight requests)
{busy && <AIProcessing requestType="strategy" active={busy} />}

// Fullscreen overlay (launch planning, video, heavy generation)
<LoadingOverlay open={busy} requestType="video" active={busy} complete={done}
  status={queued ? "queued" : "processing"} estimatedTime={40} queuePosition={7} />
```

## Wired in

- **Chat** (`app/app/page.tsx`) — replaces the old "AI CMO is thinking…" with the inline
  experience (strategy vs creative by chat mode).
- **Content Studio** (`app/studio/GenerateButton.tsx`) — every Generate button opens the
  fullscreen overlay with the category's stage sequence (video / creative / document /
  launch), including the high-demand queue experience.

## High-demand experience

When queued or providers are busy, `QueueStatus` shows a calm, reassuring panel — 🧊
"Populr is experiencing high demand", the quality framing, the estimated wait and queue
position — never "Server Busy" / "Too Many Requests".

## Design

Dark theme, green accent `#d5ff72`, smooth CSS animations (breathing brand mark, shimmer
progress, staged check-offs, floating queue icon). No spinner anywhere. All `.aip-*`
styles live in `app/globals.css`.
