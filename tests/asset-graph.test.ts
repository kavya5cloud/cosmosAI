import { describe, it, expect } from "vitest";
import { buildAssetGraph, descendantsOf, ancestorsOf, subtree } from "@/lib/services/asset-graph";
import type { AssetRow } from "@/lib/services/assets";

// Helper to make an AssetRow with sensible defaults.
function row(p: Partial<AssetRow> & { id: string; root_id: string; version: number }): AssetRow {
  return {
    campaign_id: "camp", channel: "x", asset_type: "x_post", purpose: null, title: "t", body: "b",
    structure: null, status: "draft", parent_asset_id: null, created_at: "2026-01-01",
    ...p,
  };
}

// Graph: blog(root) → [linkedin, x_thread]; x_thread → carousel. Blog has 2 versions.
const rows: AssetRow[] = [
  row({ id: "blog1", root_id: "blog1", version: 1, asset_type: "blog", channel: "articles", title: "Blog v1" }),
  row({ id: "blog2", root_id: "blog1", version: 2, asset_type: "blog", channel: "articles", title: "Blog v2", status: "approved" }),
  row({ id: "li1", root_id: "li1", version: 1, asset_type: "linkedin_post", channel: "linkedin", parent_asset_id: "blog1" }),
  row({ id: "x1", root_id: "x1", version: 1, asset_type: "x_thread", channel: "x", parent_asset_id: "blog1" }),
  row({ id: "car1", root_id: "car1", version: 1, asset_type: "ig_carousel", channel: "instagram", parent_asset_id: "x1" }),
];

describe("buildAssetGraph", () => {
  const g = buildAssetGraph("camp", rows);

  it("collapses version chains into one node per root", () => {
    expect(g.count).toBe(4); // blog (2 versions) + li + x + carousel
    expect(g.byId["blog1"].versionCount).toBe(2);
    expect(g.byId["blog1"].version).toBe(2);
    expect(g.byId["blog1"].status).toBe("approved"); // latest
    expect(g.byId["blog1"].title).toBe("Blog v2");
  });

  it("wires parent/child edges and dependencies", () => {
    expect(g.byId["blog1"].childRootIds.sort()).toEqual(["li1", "x1"]);
    expect(g.byId["x1"].childRootIds).toEqual(["car1"]);
    expect(g.byId["li1"].parentRootId).toBe("blog1");
    expect(g.byId["car1"].dependencies).toEqual(["x1"]);
    expect(g.edges).toContainEqual({ from: "blog1", to: "li1" });
  });

  it("identifies roots and assigns depth", () => {
    expect(g.roots).toEqual(["blog1"]);
    expect(g.byId["blog1"].depth).toBe(0);
    expect(g.byId["li1"].depth).toBe(1);
    expect(g.byId["car1"].depth).toBe(2);
  });

  it("flags orphans (parent edge to a missing node)", () => {
    const orphanRows = [...rows, row({ id: "z1", root_id: "z1", version: 1, parent_asset_id: "ghost" })];
    const og = buildAssetGraph("camp", orphanRows);
    expect(og.orphans).toContain("z1");
    expect(og.byId["z1"].depth).toBe(0); // treated as an entry point so traversal stays complete
  });

  it("is stable/deterministic for the same rows", () => {
    const a = buildAssetGraph("camp", rows);
    const b = buildAssetGraph("camp", rows);
    expect(a.nodes.map((n) => n.rootId)).toEqual(b.nodes.map((n) => n.rootId));
  });
});

describe("traversal", () => {
  const g = buildAssetGraph("camp", rows);
  it("descendantsOf returns the full subtree ids", () => {
    expect(descendantsOf(g, "blog1").sort()).toEqual(["car1", "li1", "x1"]);
    expect(descendantsOf(g, "x1")).toEqual(["car1"]);
    expect(descendantsOf(g, "car1")).toEqual([]);
  });
  it("ancestorsOf walks up to the root, nearest first", () => {
    expect(ancestorsOf(g, "car1")).toEqual(["x1", "blog1"]);
    expect(ancestorsOf(g, "blog1")).toEqual([]);
  });
  it("subtree includes the node and its descendants in depth order", () => {
    const st = subtree(g, "blog1");
    expect(st.map((n) => n.rootId).sort()).toEqual(["blog1", "car1", "li1", "x1"]);
    expect(st[0].rootId).toBe("blog1"); // node itself first
    expect(st[st.length - 1].rootId).toBe("car1"); // deepest last
    for (let i = 1; i < st.length; i++) expect(st[i].depth).toBeGreaterThanOrEqual(st[i - 1].depth);
  });
});
