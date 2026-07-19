import { describe, it, expect } from "vitest";
import { InMemoryHistoryRepo } from "@/lib/content/history";
import type { HistoryInput } from "@/lib/content/history";

function entry(overrides: Partial<HistoryInput> = {}): HistoryInput {
  return {
    workspaceKey: "ws1", modality: "image", kind: "landing_hero",
    providerId: "reference-image-hq", providerVersion: "1.0.0", cost: 8, latencyMs: 2500,
    promptHash: "abc123", cached: false, brief: null, mission: "Launch", campaignId: null,
    assetRootId: null, approval: "PENDING", councilScore: null, performance: null, ...overrides,
  };
}

describe("InMemoryHistoryRepo", () => {
  it("records with id + timestamp and never loses history", async () => {
    const repo = new InMemoryHistoryRepo();
    const a = await repo.record(entry());
    const b = await repo.record(entry({ kind: "carousel" }));
    expect(a.id).toBeTruthy();
    expect(a.createdAt).toBeTruthy();
    const all = await repo.list({ workspaceKey: "ws1" });
    expect(all.length).toBe(2);
    expect(all.map((r) => r.id)).toContain(b.id);
  });

  it("captures the full provenance (provider, cost, latency, hash, mission)", async () => {
    const repo = new InMemoryHistoryRepo();
    const e = await repo.record(entry());
    expect(e.providerId).toBe("reference-image-hq");
    expect(e.providerVersion).toBe("1.0.0");
    expect(e.cost).toBe(8);
    expect(e.latencyMs).toBe(2500);
    expect(e.promptHash).toBe("abc123");
    expect(e.mission).toBe("Launch");
  });

  it("filters by modality / kind / provider and scopes by workspace", async () => {
    const repo = new InMemoryHistoryRepo();
    await repo.record(entry({ modality: "image", kind: "landing_hero" }));
    await repo.record(entry({ modality: "document", kind: "blog", providerId: "reference-document" }));
    await repo.record(entry({ workspaceKey: "other" }));
    expect((await repo.list({ workspaceKey: "ws1" })).length).toBe(2);
    expect((await repo.list({ workspaceKey: "ws1", modality: "document" })).length).toBe(1);
    expect((await repo.list({ workspaceKey: "ws1", providerId: "reference-document" }))[0].kind).toBe("blog");
  });

  it("attaches an approval + performance outcome without losing the row", async () => {
    const repo = new InMemoryHistoryRepo();
    const e = await repo.record(entry());
    const ok = await repo.attachOutcome(e.id, { approval: "APPROVED", councilScore: 0.82, performance: { views: 100 } });
    expect(ok).toBe(true);
    const got = await repo.get(e.id);
    expect(got!.approval).toBe("APPROVED");
    expect(got!.councilScore).toBe(0.82);
    expect(got!.performance).toEqual({ views: 100 });
  });
});
