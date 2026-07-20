"use client";
import { useEffect, useRef, useState } from "react";
import type { CreativeCategory } from "@/lib/creative/taxonomy";
import { LoadingOverlay } from "@/app/components/ai-processing";
import type { RequestType } from "@/app/components/ai-processing";

// The Studio "Generate" control. Generation isn't wired to providers yet, so this
// demonstrates the standard AI Processing experience — the fullscreen overlay with the
// stage sequence for this category (video / creative / document / launch). It shows the
// high-demand queue experience first when providers are busy.

const TYPE_FOR_CATEGORY: Record<CreativeCategory, RequestType> = {
  launch: "launch", videos: "video", ugc: "creative", motion: "creative",
  images: "creative", documents: "document", ads: "creative", library: "creative",
};

export default function GenerateButton({ category, label }: { category: CreativeCategory; label: string }) {
  const [open, setOpen] = useState(false);
  const [complete, setComplete] = useState(false);
  const [queued, setQueued] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function start() {
    setComplete(false);
    // Simulate the occasional high-demand queue, then process, then complete.
    const busy = Math.random() < 0.35;
    setQueued(busy);
    setOpen(true);
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (busy) timers.current.push(setTimeout(() => setQueued(false), 3200));
    const total = (busy ? 3200 : 0) + 9000;
    timers.current.push(setTimeout(() => setComplete(true), total));
    timers.current.push(setTimeout(() => setOpen(false), total + 1400));
  }

  return (
    <>
      <button className="st-card-cta st-card-gen" onClick={start}>Generate</button>
      <LoadingOverlay
        open={open}
        requestType={TYPE_FOR_CATEGORY[category]}
        active={open}
        status={queued ? "queued" : "processing"}
        estimatedTime={queued ? 40 : 12}
        queuePosition={queued ? 7 : undefined}
        complete={complete}
        title={`Creating your ${label}`}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
