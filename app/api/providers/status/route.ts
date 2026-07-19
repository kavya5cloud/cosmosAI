import { NextRequest, NextResponse } from "next/server";
import { getRegistry } from "@/lib/content/registry";
import { MODALITIES } from "@/lib/content/types";

export const runtime = "nodejs";

// Provider status — availability + version per provider, and a per-modality summary so
// ops can see coverage and the router knows what it can fall back to.
export async function GET(_req: NextRequest) {
  const registry = getRegistry();
  const providers = registry.list().map((p) => ({
    id: p.id, modality: p.modality, version: p.version, available: p.available,
  }));
  const byModality = Object.fromEntries(MODALITIES.map((m) => {
    const inMod = providers.filter((p) => p.modality === m);
    return [m, { total: inMod.length, available: inMod.filter((p) => p.available).length }];
  }));
  const healthy = providers.every((p) => p.available);
  return NextResponse.json({ ok: true, healthy, providers, byModality });
}
