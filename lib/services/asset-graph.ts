import type { AssetRow } from "@/lib/services/assets";

// Asset Graph traversal — turns the flat, version-chained content_assets rows into a
// structured, traversable graph of asset OBJECTS. Each node is one asset chain (a root_id)
// with its full version history; edges are parent→child derivation links. Pure functions,
// so they're trivially testable and reused by the traversal API and (later) the UI.

export type AssetVersion = {
  id: string;
  version: number;
  status: string;
  title: string;
  body: string;
  createdAt: string;
};

export type AssetNode = {
  rootId: string;
  assetType: string;
  channel: string;
  purpose: string | null;
  status: string;        // the chain's current status (latest version)
  title: string;         // latest title
  version: number;       // latest version number
  versionCount: number;
  parentRootId: string | null;
  childRootIds: string[];
  dependencies: string[]; // rootIds this asset was derived from (== parent for now)
  depth: number;          // distance from a root
  versions: AssetVersion[];
};

export type AssetGraph = {
  campaignId: string;
  nodes: AssetNode[];
  byId: Record<string, AssetNode>;
  roots: string[];        // rootIds with no parent
  orphans: string[];      // rootIds whose parent points at a missing node
  edges: { from: string; to: string }[];
  count: number;
};

/** Build the traversable asset graph for a campaign from its flat version rows. */
export function buildAssetGraph(campaignId: string, rows: AssetRow[]): AssetGraph {
  // Group rows into chains keyed by root_id.
  const chains = new Map<string, AssetRow[]>();
  for (const r of rows) {
    const key = r.root_id || r.id;
    const list = chains.get(key) || [];
    list.push(r);
    chains.set(key, list);
  }

  const byId: Record<string, AssetNode> = {};
  for (const [rootId, versionsRaw] of chains) {
    const versionsSorted = [...versionsRaw].sort((a, b) => a.version - b.version);
    const latest = versionsSorted[versionsSorted.length - 1];
    const parentRootId = versionsSorted[0].parent_asset_id;
    byId[rootId] = {
      rootId,
      assetType: latest.asset_type,
      channel: latest.channel,
      purpose: latest.purpose,
      status: latest.status,
      title: latest.title,
      version: latest.version,
      versionCount: versionsSorted.length,
      parentRootId,
      childRootIds: [],
      dependencies: parentRootId ? [parentRootId] : [],
      depth: 0,
      versions: versionsSorted.map((v) => ({ id: v.id, version: v.version, status: v.status, title: v.title, body: v.body, createdAt: v.created_at })),
    };
  }

  // Wire children + collect edges + detect orphans (parent points at a missing node).
  const edges: { from: string; to: string }[] = [];
  const orphans: string[] = [];
  for (const node of Object.values(byId)) {
    if (!node.parentRootId) continue;
    const parent = byId[node.parentRootId];
    if (parent) {
      parent.childRootIds.push(node.rootId);
      edges.push({ from: parent.rootId, to: node.rootId });
    } else {
      orphans.push(node.rootId); // dangling edge — no orphan asset should exist, but flag it
    }
  }

  const roots = Object.values(byId).filter((n) => !n.parentRootId).map((n) => n.rootId);

  // Assign depth by BFS from roots (and orphans, treated as depth-0 entry points).
  const seed = [...roots, ...orphans];
  const queue: { id: string; depth: number }[] = seed.map((id) => ({ id, depth: 0 }));
  const seen = new Set<string>();
  while (queue.length) {
    const { id, depth } = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId[id];
    if (!node) continue;
    node.depth = depth;
    for (const child of node.childRootIds) queue.push({ id: child, depth: depth + 1 });
  }

  const nodes = Object.values(byId).sort((a, b) => a.depth - b.depth || a.rootId.localeCompare(b.rootId));
  return { campaignId, nodes, byId, roots, orphans, edges, count: nodes.length };
}

/** All descendant rootIds of a node (depth-first, cycle-safe). */
export function descendantsOf(graph: AssetGraph, rootId: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([rootId]);
  const stack = [...(graph.byId[rootId]?.childRootIds ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    stack.push(...(graph.byId[id]?.childRootIds ?? []));
  }
  return out;
}

/** All ancestor rootIds of a node, nearest first. */
export function ancestorsOf(graph: AssetGraph, rootId: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([rootId]);
  let cur = graph.byId[rootId]?.parentRootId ?? null;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    out.push(cur);
    cur = graph.byId[cur]?.parentRootId ?? null;
  }
  return out;
}

/** The node plus its full subtree, in depth order. */
export function subtree(graph: AssetGraph, rootId: string): AssetNode[] {
  if (!graph.byId[rootId]) return [];
  const ids = [rootId, ...descendantsOf(graph, rootId)];
  return ids.map((id) => graph.byId[id]).filter(Boolean).sort((a, b) => a.depth - b.depth);
}
