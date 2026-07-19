import { describe, it, expect } from "vitest";
import { ProviderRegistry, createDefaultRegistry } from "@/lib/content/registry";
import { GenerationRouter, InMemoryCache, getSharedCache } from "@/lib/content/router";
import { ReferenceProvider } from "@/lib/content/providers/base";
import { kindsForModality } from "@/lib/content/providers";
import type { ImageSpec } from "@/lib/content/types";

const spec: ImageSpec = { modality: "image", kind: "landing_hero", prompt: "a hero image", aspectRatio: "16:9", count: 1 };

function imageProvider(id: string, quality: number, cost: number, opts: { available?: boolean; fail?: boolean } = {}) {
  const p = new ReferenceProvider({
    id, modality: "image", version: "1.0.0", ext: "png", basePixels: 1024, available: opts.available ?? true,
    caps: { kinds: kindsForModality("image"), maxBatch: 4, supportsEdit: true, supportsUpscale: false, supportsVariations: true, quality, speed: 0.5, costPerUnit: cost },
  });
  if (opts.fail) {
    p.generate = async () => { throw new Error("provider_down"); };
  }
  return p;
}

describe("GenerationRouter", () => {
  it("selects the best provider and returns a typed result", async () => {
    const registry = new ProviderRegistry().register(imageProvider("high", 0.95, 4)).register(imageProvider("low", 0.6, 1));
    const router = new GenerationRouter({ registry });
    const res = await router.generate({ spec });
    expect(res.providerId).toBe("high");
    expect(res.output.media?.length).toBe(1);
    expect(res.cached).toBe(false);
    expect(res.attempts).toEqual([{ providerId: "high", ok: true }]);
  });

  it("caches: a repeat request is served from cache with zero cost", async () => {
    const registry = new ProviderRegistry().register(imageProvider("high", 0.95, 4));
    const cache = new InMemoryCache();
    const router = new GenerationRouter({ registry, cache });
    const first = await router.generate({ spec });
    expect(first.cached).toBe(false);
    const second = await router.generate({ spec });
    expect(second.cached).toBe(true);
    expect(second.cost.credits).toBe(0);
    expect(cache.size()).toBeGreaterThan(0);
  });

  it("falls back to the next provider when the best one fails", async () => {
    const registry = new ProviderRegistry()
      .register(imageProvider("broken", 0.95, 4, { fail: true }))
      .register(imageProvider("backup", 0.7, 2));
    const router = new GenerationRouter({ registry });
    const res = await router.generate({ spec });
    expect(res.providerId).toBe("backup");
    expect(res.attempts[0]).toEqual({ providerId: "broken", ok: false, error: expect.stringContaining("provider_down") });
    expect(res.attempts[1].ok).toBe(true);
  });

  it("throws when no provider can serve the spec", async () => {
    const registry = new ProviderRegistry(); // empty
    const router = new GenerationRouter({ registry });
    await expect(router.generate({ spec })).rejects.toThrow(/no_provider_available/);
  });

  it("optimizes for cost when a maxCredits constraint is present", async () => {
    const registry = new ProviderRegistry().register(imageProvider("hq", 0.95, 40)).register(imageProvider("cheap", 0.7, 1));
    const router = new GenerationRouter({ registry });
    const res = await router.generate({ spec, constraints: { maxCredits: 10 } });
    expect(res.providerId).toBe("cheap");
  });

  it("quotes the cheapest eligible cost without generating", () => {
    const registry = new ProviderRegistry().register(imageProvider("hq", 0.95, 40)).register(imageProvider("cheap", 0.7, 1));
    const router = new GenerationRouter({ registry });
    expect(router.quote(spec)).toBe(1);
  });

  it("batches independent requests", async () => {
    const router = new GenerationRouter({ registry: createDefaultRegistry() });
    const out = await router.batch([{ spec }, { spec: { ...spec, kind: "carousel" } }]);
    expect(out.every((r) => r.status === "fulfilled")).toBe(true);
  });

  it("streams progress then the final result", async () => {
    const router = new GenerationRouter({ registry: createDefaultRegistry() });
    const events: string[] = [];
    let result = null;
    for await (const ev of router.stream({ spec })) {
      if (ev.type === "progress") events.push(ev.phase);
      else result = ev.result;
    }
    expect(events).toContain("queued");
    expect(result).not.toBeNull();
  });

  it("shares one process cache so cache hits survive across router instances", async () => {
    const cache = getSharedCache();
    cache.clear();
    const registry = createDefaultRegistry();
    const uniqueSpec = { ...spec, prompt: `shared-cache-${Date.now()}` };
    const a = await new GenerationRouter({ registry, cache }).generate({ spec: uniqueSpec });
    const b = await new GenerationRouter({ registry, cache }).generate({ spec: uniqueSpec });
    expect(a.cached).toBe(false);
    expect(b.cached).toBe(true); // second, different router instance, still a hit
    cache.clear();
  });

  it("routes edits to an edit-capable provider", async () => {
    const registry = createDefaultRegistry();
    const router = new GenerationRouter({ registry });
    const gen = await router.generate({ spec });
    const edited = await router.edit({ spec }, "make it warmer", gen.output);
    expect(edited.output.meta?.edited).toBe(true);
  });
});
