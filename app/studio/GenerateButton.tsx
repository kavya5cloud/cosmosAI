"use client";
import { useState } from "react";
import type { CreativeCategory } from "@/lib/creative/taxonomy";
import { LoadingOverlay } from "@/app/components/ai-processing";

// The Studio "Generate" control. It creates a real Job (POST /api/jobs) and drives the
// fullscreen AI Processing overlay from the job's LIVE execution progress — no simulated
// stages. The Job Engine orchestrates Planner → Creative Intelligence → Generation →
// Creative Director → Approval → Learning behind the scenes.

const JOB_FOR_CATEGORY: Record<CreativeCategory, string> = {
  launch: "campaign_planning", videos: "video_generation", ugc: "ugc", motion: "motion_graphics",
  images: "image_generation", documents: "document", ads: "ads", library: "image_generation",
};

const SAMPLE_BRIEF = {
  objective: "Launch to founders", audience: "seed-stage founders", keyMessage: "an AI CMO that reasons",
  emotionalAngle: "calm confidence", proof: "deterministic engine", cta: "join early access",
  visualDirection: "clean, premium", successMetric: "signups",
};

export default function GenerateButton({ category, label }: { category: CreativeCategory; label: string }) {
  const [open, setOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  async function start() {
    setOpen(true);
    setJobId(null);
    try {
      const r = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: JOB_FOR_CATEGORY[category], requestType: category, brief: SAMPLE_BRIEF }),
      });
      const d = await r.json();
      if (d?.job?.id) setJobId(d.job.id);
    } catch { /* overlay stays in its initial state; user can close */ }
  }

  return (
    <>
      <button className="st-card-cta st-card-gen" onClick={start}>Generate</button>
      <LoadingOverlay
        open={open}
        jobId={jobId}
        requestType={category}
        active={open}
        title={`Creating your ${label}`}
        onComplete={() => setTimeout(() => { setOpen(false); setJobId(null); }, 1500)}
        onCancel={() => { setOpen(false); setJobId(null); }}
      />
    </>
  );
}
