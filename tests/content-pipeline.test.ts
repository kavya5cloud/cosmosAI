import { describe, it, expect } from "vitest";
import { ContentStudio } from "@/lib/content/studio";
import { buildSpec } from "@/lib/content/pipeline";
import type { CreativeBriefInput, PlannerInput } from "@/lib/creative/types";

const brief: CreativeBriefInput = {
  objective: "Launch to founders",
  audience: "founders",
  keyMessage: "an AI CMO that reasons",
  emotionalAngle: "calm confidence",
  proof: "deterministic decision engine",
  cta: "join early access",
  visualDirection: "clean minimal",
  successMetric: "signups",
};

describe("buildSpec", () => {
  it("builds a modality-correct spec from a kind + brief", () => {
    expect(buildSpec({ kind: "landing_hero", brief }).modality).toBe("image");
    expect(buildSpec({ kind: "hero_video", brief }).modality).toBe("video");
    expect(buildSpec({ kind: "blog", brief }).modality).toBe("document");
    expect(buildSpec({ kind: "motion_graphic", brief }).modality).toBe("motion");
    // prompt is derived deterministically from the brief
    expect(buildSpec({ kind: "landing_hero", brief }).prompt).toContain("founders");
  });
});

describe("ContentStudio (in-memory, no DB)", () => {
  function studio() { return new ContentStudio({ workspaceKey: "ws1" }); }

  it("generates an image asset end-to-end: provider → council → history + media", async () => {
    const s = studio();
    const r = await s.images(brief, "landing_hero");
    expect(r.result.modality).toBe("image");
    expect(r.result.providerId).toMatch(/^reference-image/);
    expect(["APPROVED", "REVISION_REQUIRED", "REJECTED"]).toContain(r.approval);
    expect(r.historyId).toBeTruthy();
    expect(r.mediaId).toBeTruthy();
    // history + library reflect the generation
    expect((await s.history()).length).toBe(1);
    expect((await s.library()).length).toBeGreaterThan(0);
  });

  it("generates a document asset (text content, no media)", async () => {
    const s = studio();
    const r = await s.documents(brief, "blog");
    expect(r.result.modality).toBe("document");
    expect(r.result.output.content).toContain("#");
    expect(r.mediaId).toBeNull();
    expect(r.historyId).toBeTruthy();
  });

  it("runs UGC as a creator-style video", async () => {
    const s = studio();
    const r = await s.ugc(brief);
    expect(r.result.kind).toBe("ugc_video");
    expect(r.result.modality).toBe("video");
  });

  it("dry-run skips persistence", async () => {
    const s = studio();
    const r = await s.generate({ kind: "landing_hero", brief, dryRun: true });
    expect(r.historyId).toBeNull();
    expect(r.mediaId).toBeNull();
    expect((await s.history()).length).toBe(0);
  });

  it("history is filterable by modality", async () => {
    const s = studio();
    await s.images(brief, "landing_hero");
    await s.documents(brief, "blog");
    expect((await s.history({ modality: "document" })).length).toBe(1);
  });

  it("launch plans then generates one asset per distinct kind", async () => {
    const s = studio();
    const input: PlannerInput = {
      mission: "Launch Populr",
      campaign: { goal: "launch_product", title: "Launch Populr", channels: ["articles", "linkedin"] },
      brief,
    };
    const { plan, results } = await s.launch(input);
    expect(plan.assets.length).toBeGreaterThan(0);
    expect(results.length).toBeGreaterThan(0);
    // every generation is recorded in history
    expect((await s.history({ limit: 100 })).length).toBe(results.length);
  });

  it("is deterministic across two identical generations (same provider + hash)", async () => {
    const a = await studio().generate({ kind: "landing_hero", brief, dryRun: true });
    const b = await studio().generate({ kind: "landing_hero", brief, dryRun: true });
    expect(a.result.promptHash).toBe(b.result.promptHash);
    expect(a.result.providerId).toBe(b.result.providerId);
    expect(a.result.output.media?.[0].uri).toBe(b.result.output.media?.[0].uri);
  });
});
