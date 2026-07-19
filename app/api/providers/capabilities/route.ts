import { NextRequest, NextResponse } from "next/server";
import { getRegistry } from "@/lib/content/registry";
import { ASSET_KINDS, type AssetKind } from "@/lib/creative/taxonomy";
import type { Modality } from "@/lib/content/types";

export const runtime = "nodejs";

// Capability lookup. Optional ?modality= or ?kind= narrows to the providers that can
// serve it, so the UI/router can quote options without knowing any vendor.
export async function GET(req: NextRequest) {
  const registry = getRegistry();
  const modality = req.nextUrl.searchParams.get("modality") as Modality | null;
  const kind = req.nextUrl.searchParams.get("kind") as AssetKind | null;

  let providers = registry.all();
  if (modality) providers = providers.filter((p) => p.modality === modality);
  if (kind && (ASSET_KINDS as readonly string[]).includes(kind)) providers = registry.findByKind(kind);

  const capabilities = providers.map((p) => ({
    id: p.id, version: p.version, available: p.isAvailable(), capabilities: p.capabilities(),
  }));
  return NextResponse.json({ ok: true, count: capabilities.length, capabilities });
}
