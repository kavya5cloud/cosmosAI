import { NextRequest, NextResponse } from "next/server";
import { getRegistry } from "@/lib/content/registry";

export const runtime = "nodejs";

// Provider catalog — the registered generation providers and their declared
// capabilities. Vendor-neutral: callers never see or choose a real vendor.
export async function GET(_req: NextRequest) {
  const registry = getRegistry();
  const providers = registry.list();
  return NextResponse.json({ ok: true, count: providers.length, providers });
}
