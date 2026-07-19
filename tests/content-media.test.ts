import { describe, it, expect } from "vitest";
import { InMemoryMediaRepo } from "@/lib/content/media";
import type { MediaInput } from "@/lib/content/media";

function item(overrides: Partial<MediaInput> = {}): MediaInput {
  return {
    workspaceKey: "ws1", mediaType: "image", uri: "populr://media/image/abc.png", mime: "image/png",
    title: "Hero image", tags: ["image", "landing_hero"], kind: "landing_hero", providerId: "reference-image-hq",
    assetRootId: null, bytes: 2048, width: 1024, height: 576, durationMs: null, meta: null, ...overrides,
  };
}

describe("InMemoryMediaRepo", () => {
  it("stores and returns media with id + timestamp", async () => {
    const repo = new InMemoryMediaRepo();
    const m = await repo.put(item());
    expect(m.id).toBeTruthy();
    expect((await repo.get(m.id))!.uri).toBe("populr://media/image/abc.png");
  });

  it("supports every media type", async () => {
    const repo = new InMemoryMediaRepo();
    for (const t of ["image", "video", "audio", "template", "character", "logo", "font", "brand_asset", "motion_asset"] as const) {
      await repo.put(item({ mediaType: t, title: t }));
    }
    expect((await repo.search({ workspaceKey: "ws1" })).length).toBe(9);
    expect((await repo.search({ workspaceKey: "ws1", mediaType: "logo" })).length).toBe(1);
  });

  it("searches by free text over title and tags", async () => {
    const repo = new InMemoryMediaRepo();
    await repo.put(item({ title: "Launch hero", tags: ["campaign"] }));
    await repo.put(item({ title: "Pricing carousel", tags: ["carousel"] }));
    expect((await repo.search({ workspaceKey: "ws1", q: "launch" })).length).toBe(1);
    expect((await repo.search({ workspaceKey: "ws1", q: "carousel" })).length).toBe(1);
    expect((await repo.search({ workspaceKey: "ws1", tag: "campaign" })).length).toBe(1);
  });

  it("scopes results by workspace", async () => {
    const repo = new InMemoryMediaRepo();
    await repo.put(item());
    await repo.put(item({ workspaceKey: "other" }));
    expect((await repo.search({ workspaceKey: "ws1" })).length).toBe(1);
  });
});
