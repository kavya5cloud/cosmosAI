import { describe, it, expect } from "vitest";
import { defaultProviders, kindsForModality } from "@/lib/content/providers";
import { ReferenceProvider } from "@/lib/content/providers/base";
import type { ImageSpec, DocumentSpec } from "@/lib/content/types";

const imageSpec: ImageSpec = { modality: "image", kind: "landing_hero", prompt: "hero", aspectRatio: "16:9", count: 2 };
const docSpec: DocumentSpec = { modality: "document", kind: "blog", prompt: "write a blog", sections: ["intro", "body"] };

describe("default providers", () => {
  const providers = defaultProviders();
  it("registers vendor-neutral providers across every modality", () => {
    const modalities = new Set(providers.map((p) => p.modality));
    expect(modalities).toEqual(new Set(["image", "video", "document", "voice", "motion"]));
    // no vendor names leak into ids
    for (const p of providers) expect(p.id).toMatch(/^reference-/);
  });
  it("exposes the full provider contract", () => {
    for (const p of providers) {
      expect(typeof p.generate).toBe("function");
      expect(typeof p.edit).toBe("function");
      expect(typeof p.upscale).toBe("function");
      expect(typeof p.variations).toBe("function");
      expect(typeof p.estimateCost).toBe("function");
      expect(typeof p.estimateLatency).toBe("function");
      expect(typeof p.capabilities).toBe("function");
    }
  });
});

describe("kindsForModality", () => {
  it("maps image kinds", () => {
    expect(kindsForModality("image")).toContain("landing_hero");
    expect(kindsForModality("document")).toContain("blog");
    expect(kindsForModality("video")).toContain("hero_video");
  });
});

describe("ReferenceProvider generation", () => {
  const img = new ReferenceProvider({
    id: "reference-image-hq", modality: "image", version: "1.0.0", ext: "png", basePixels: 2048,
    caps: { kinds: kindsForModality("image"), maxBatch: 8, supportsEdit: true, supportsUpscale: true, supportsVariations: true, quality: 0.9, speed: 0.5, costPerUnit: 4 },
  });

  it("produces the requested count of vendor-neutral media", async () => {
    const out = await img.generate(imageSpec);
    expect(out.media?.length).toBe(2);
    for (const m of out.media!) {
      expect(m.uri).toMatch(/^populr:\/\/media\/image\//);
      expect(m.mime).toBe("image/png");
    }
  });

  it("is deterministic — same spec, same output", async () => {
    expect(JSON.stringify(await img.generate(imageSpec))).toBe(JSON.stringify(await img.generate(imageSpec)));
  });

  it("upscale doubles dimensions", async () => {
    const out = await img.generate(imageSpec);
    const up = await img.upscale(out);
    expect(up.media![0].width).toBe(out.media![0].width! * 2);
  });

  it("estimates cost and latency from capabilities", () => {
    const cost = img.estimateCost(imageSpec);
    expect(cost.credits).toBeGreaterThan(0); // 4/unit × 2
    expect(img.estimateLatency(imageSpec).ms).toBeGreaterThan(0);
  });

  it("documents return text content, not media", async () => {
    const doc = new ReferenceProvider({
      id: "reference-document", modality: "document", version: "1.0.0",
      caps: { kinds: kindsForModality("document"), maxBatch: 6, supportsEdit: true, supportsUpscale: false, supportsVariations: true, quality: 0.8, speed: 0.9, costPerUnit: 0.5 },
    });
    const out = await doc.generate(docSpec);
    expect(out.content).toContain("#");
    expect(out.media ?? []).toHaveLength(0);
  });

  it("availability can be toggled for fallback/status", () => {
    expect(img.isAvailable()).toBe(true);
    img.setAvailable(false);
    expect(img.isAvailable()).toBe(false);
    img.setAvailable(true);
  });
});
