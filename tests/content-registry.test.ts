import { describe, it, expect } from "vitest";
import { ProviderRegistry, createDefaultRegistry } from "@/lib/content/registry";
import { ReferenceProvider } from "@/lib/content/providers/base";
import { kindsForModality } from "@/lib/content/providers";
import type { ImageSpec } from "@/lib/content/types";

const imageSpec: ImageSpec = { modality: "image", kind: "landing_hero", prompt: "hero", aspectRatio: "1:1", count: 1 };

function imageProvider(id: string, quality: number, cost: number, available = true) {
  return new ReferenceProvider({
    id, modality: "image", version: "1.0.0", ext: "png", basePixels: 1024, available,
    caps: { kinds: kindsForModality("image"), maxBatch: 4, supportsEdit: true, supportsUpscale: false, supportsVariations: true, quality, speed: 0.5, costPerUnit: cost },
  });
}

describe("ProviderRegistry", () => {
  it("registers, looks up by kind and modality, and versions in place", () => {
    const reg = new ProviderRegistry();
    reg.register(imageProvider("a", 0.9, 4));
    expect(reg.findByKind("landing_hero").map((p) => p.id)).toEqual(["a"]);
    expect(reg.findByModality("image").length).toBe(1);
    // re-register same id swaps the provider (versioning)
    reg.register(imageProvider("a", 0.5, 4));
    expect(reg.get("a")!.capabilities().quality).toBe(0.5);
    expect(reg.all().length).toBe(1);
  });

  it("orders candidates by quality by default (best first)", () => {
    const reg = new ProviderRegistry().register(imageProvider("low", 0.6, 1)).register(imageProvider("high", 0.95, 4));
    expect(reg.candidates(imageSpec).map((p) => p.id)).toEqual(["high", "low"]);
  });

  it("optimizes for cost when asked", () => {
    const reg = new ProviderRegistry().register(imageProvider("low", 0.6, 1)).register(imageProvider("high", 0.95, 4));
    expect(reg.candidates(imageSpec, { optimizeFor: "cost" })[0].id).toBe("low");
  });

  it("respects a quality floor and a cost cap", () => {
    const reg = new ProviderRegistry().register(imageProvider("low", 0.6, 1)).register(imageProvider("high", 0.95, 4));
    expect(reg.candidates(imageSpec, { minQuality: 0.9 }).map((p) => p.id)).toEqual(["high"]);
    expect(reg.candidates(imageSpec, { maxCredits: 2 }).map((p) => p.id)).toEqual(["low"]);
  });

  it("excludes unavailable and excluded providers", () => {
    const reg = new ProviderRegistry().register(imageProvider("down", 0.99, 4, false)).register(imageProvider("up", 0.7, 2));
    expect(reg.candidates(imageSpec).map((p) => p.id)).toEqual(["up"]);
    expect(reg.candidates(imageSpec, { excludeProviderIds: ["up"] }).length).toBe(0);
  });

  it("floats a preferred provider to the top when eligible", () => {
    const reg = new ProviderRegistry().register(imageProvider("a", 0.95, 4)).register(imageProvider("b", 0.7, 1));
    expect(reg.candidates(imageSpec, { preferProviderId: "b" })[0].id).toBe("b");
  });

  it("estimates cheapest cost and best quality", () => {
    const reg = new ProviderRegistry().register(imageProvider("low", 0.6, 1)).register(imageProvider("high", 0.95, 4));
    expect(reg.estimateCost(imageSpec)).toBe(1);
    expect(reg.estimateQuality(imageSpec)).toBe(0.95);
  });

  it("default registry has providers for all five modalities", () => {
    const reg = createDefaultRegistry();
    for (const m of ["image", "video", "document", "voice", "motion"] as const) {
      expect(reg.findByModality(m).length).toBeGreaterThan(0);
    }
  });
});
