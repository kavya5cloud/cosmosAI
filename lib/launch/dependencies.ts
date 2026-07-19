import type { AssetKind } from "@/lib/creative/taxonomy";
import type { LaunchCampaign, LaunchDependencyGraph, DependencyNode } from "@/lib/launch/types";
import { assetKey } from "@/lib/launch/timeline";

// Campaign Dependencies — the derivation graph across the whole launch. Combines the
// Asset Planner's intra-campaign dependencies with launch-level cross-asset rules
// (Hero Video → Ads → Shorts → UGC …). When an upstream asset changes, flagDependents
// returns every downstream asset that must be revisited. Pure + deterministic.

// Cross-asset derivation rules at the launch level. Foundational media/copy feeds the
// downstream distribution + amplification assets, even across campaigns.
const DEP_RULES: Partial<Record<AssetKind, AssetKind[]>> = {
  hero_video: ["product_demo", "advertisement", "ugc_video", "motion_graphic"],
  product_demo: ["ugc_video"],
  landing_hero: ["carousel", "advertisement", "instagram_post", "infographic"],
  blog: ["linkedin_post", "x_thread", "reddit_post", "email", "press_release"],
};

export function buildDependencyGraph(campaigns: LaunchCampaign[]): LaunchDependencyGraph {
  const byKey: Record<string, DependencyNode> = {};

  // 1) Nodes for every planned asset.
  for (const c of campaigns) {
    for (const a of c.assetPlan.assets) {
      const key = assetKey(c.id, a.kind);
      byKey[key] = { key, kind: a.kind, label: a.label, campaignId: c.id, dependsOn: [], dependents: [], depth: 0 };
    }
  }

  const edges: { from: string; to: string }[] = [];
  const addEdge = (from: string, to: string) => {
    if (from === to || !byKey[from] || !byKey[to]) return;
    if (byKey[to].dependsOn.includes(from)) return; // dedupe
    // avoid obvious cycles: don't add if `to` is already upstream of `from`
    if (isUpstream(byKey, to, from)) return;
    byKey[to].dependsOn.push(from);
    byKey[from].dependents.push(to);
    edges.push({ from, to });
  };

  // 2) Intra-campaign edges from the Asset Planner's dependsOn (keys are kinds within a plan).
  for (const c of campaigns) {
    for (const a of c.assetPlan.assets) {
      const to = assetKey(c.id, a.kind);
      for (const depKind of a.dependsOn) addEdge(assetKey(c.id, depKind), to);
    }
  }

  // 3) Launch-level cross-asset rules. Prefer a same-campaign upstream; otherwise link
  //    to the first campaign that owns the upstream kind (foundation feeds conversion).
  const ownersOfKind = (kind: AssetKind) =>
    campaigns.filter((c) => c.assetPlan.assets.some((a) => a.kind === kind)).map((c) => c.id);

  for (const c of campaigns) {
    for (const a of c.assetPlan.assets) {
      const downstream = DEP_RULES[a.kind];
      if (!downstream) continue;
      const from = assetKey(c.id, a.kind);
      for (const dKind of downstream) {
        // same campaign first
        if (c.assetPlan.assets.some((x) => x.kind === dKind)) {
          addEdge(from, assetKey(c.id, dKind));
        } else {
          for (const ownerId of ownersOfKind(dKind)) addEdge(from, assetKey(ownerId, dKind));
        }
      }
    }
  }

  // 4) Depth via BFS from roots (cycle-safe).
  const roots = Object.values(byKey).filter((n) => n.dependsOn.length === 0).map((n) => n.key);
  const queue = roots.map((key) => ({ key, depth: 0 }));
  const seen = new Set<string>();
  while (queue.length) {
    const { key, depth } = queue.shift()!;
    if (seen.has(key)) continue;
    seen.add(key);
    byKey[key].depth = depth;
    for (const d of byKey[key].dependents) queue.push({ key: d, depth: depth + 1 });
  }

  const nodes = Object.values(byKey).sort((a, b) => a.depth - b.depth || a.key.localeCompare(b.key));
  return { nodes, byKey, edges, roots };
}

function isUpstream(byKey: Record<string, DependencyNode>, maybeAncestor: string, of: string): boolean {
  const stack = [...(byKey[of]?.dependsOn ?? [])];
  const seen = new Set<string>();
  while (stack.length) {
    const k = stack.pop()!;
    if (k === maybeAncestor) return true;
    if (seen.has(k)) continue;
    seen.add(k);
    stack.push(...(byKey[k]?.dependsOn ?? []));
  }
  return false;
}

/** Every downstream asset that must be revisited when `changedKey` changes (Part 4). */
export function flagDependents(graph: LaunchDependencyGraph, changedKey: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([changedKey]);
  const stack = [...(graph.byKey[changedKey]?.dependents ?? [])];
  while (stack.length) {
    const k = stack.pop()!;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    stack.push(...(graph.byKey[k]?.dependents ?? []));
  }
  return out.sort((a, b) => (graph.byKey[a].depth - graph.byKey[b].depth) || a.localeCompare(b));
}

/** Upstream chain a given asset derives from, nearest first. */
export function upstreamOf(graph: LaunchDependencyGraph, key: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([key]);
  const stack = [...(graph.byKey[key]?.dependsOn ?? [])];
  while (stack.length) {
    const k = stack.pop()!;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    stack.push(...(graph.byKey[k]?.dependsOn ?? []));
  }
  return out;
}
