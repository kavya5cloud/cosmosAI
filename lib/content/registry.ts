import type { AssetKind } from "@/lib/creative/taxonomy";
import type {
  Capabilities, GenerationProvider, GenerationSpec, Modality,
} from "@/lib/content/types";
import { defaultProviders } from "@/lib/content/providers";

// Provider Registry — the catalog the router selects from. Owns registration,
// capability lookup, cost/quality estimation, fallback ordering, availability and
// versioning. It knows NOTHING about specific vendors; it only ranks providers by
// their declared capabilities.

export type SelectionConstraints = {
  minQuality?: number;
  maxCredits?: number;
  preferProviderId?: string;
  excludeProviderIds?: string[];
  /** Optimize the ordering for cost, quality, or speed (default: quality). */
  optimizeFor?: "quality" | "cost" | "speed" | "balanced";
};

export type ProviderInfo = {
  id: string;
  modality: Modality;
  version: string;
  available: boolean;
  capabilities: Capabilities;
};

export class ProviderRegistry {
  private providers = new Map<string, GenerationProvider>();

  register(provider: GenerationProvider): this {
    // Versioning: the same id can be re-registered to swap versions/adapters live.
    this.providers.set(provider.id, provider);
    return this;
  }

  unregister(id: string): boolean {
    return this.providers.delete(id);
  }

  get(id: string): GenerationProvider | undefined {
    return this.providers.get(id);
  }

  all(): GenerationProvider[] {
    return [...this.providers.values()];
  }

  list(): ProviderInfo[] {
    return this.all().map((p) => ({
      id: p.id, modality: p.modality, version: p.version,
      available: p.isAvailable(), capabilities: p.capabilities(),
    }));
  }

  /** Every provider that can produce this asset kind (ignores availability). */
  findByKind(kind: AssetKind): GenerationProvider[] {
    return this.all().filter((p) => p.capabilities().kinds.includes(kind));
  }

  findByModality(modality: Modality): GenerationProvider[] {
    return this.all().filter((p) => p.modality === modality);
  }

  /**
   * Ordered candidate list for a spec — best first. Applies constraints (quality floor,
   * cost cap, prefer/exclude, availability) then sorts by the chosen objective. This IS
   * the fallback chain: the router tries them in order.
   */
  candidates(spec: GenerationSpec, constraints: SelectionConstraints = {}): GenerationProvider[] {
    const {
      minQuality = 0, maxCredits, preferProviderId, excludeProviderIds = [], optimizeFor = "quality",
    } = constraints;

    let pool = this.all().filter((p) => {
      if (p.modality !== spec.modality) return false;
      if (!p.isAvailable()) return false;
      if (excludeProviderIds.includes(p.id)) return false;
      const caps = p.capabilities();
      // A provider with declared kinds must list this kind; a provider with no declared
      // kinds (e.g. a generic voice adapter) serves its whole modality.
      if (caps.kinds.length > 0 && !caps.kinds.includes(spec.kind)) return false;
      if (caps.quality < minQuality) return false;
      if (maxCredits != null && p.estimateCost(spec).credits > maxCredits) return false;
      return true;
    });

    const cost = (p: GenerationProvider) => p.estimateCost(spec).credits;
    const score = (p: GenerationProvider) => {
      const c = p.capabilities();
      switch (optimizeFor) {
        case "cost": return -cost(p);
        case "speed": return c.speed;
        case "balanced": return c.quality * 0.5 + c.speed * 0.2 - (cost(p) / 100) * 0.3;
        default: return c.quality;
      }
    };

    pool = pool.sort((a, b) => {
      // Preferred provider always floats to the top when eligible.
      if (preferProviderId) {
        if (a.id === preferProviderId) return -1;
        if (b.id === preferProviderId) return 1;
      }
      const d = score(b) - score(a);
      if (Math.abs(d) > 1e-9) return d;
      return a.id.localeCompare(b.id); // deterministic tiebreak
    });
    return pool;
  }

  /** The single best provider for a spec (or null if none qualifies). */
  select(spec: GenerationSpec, constraints?: SelectionConstraints): GenerationProvider | null {
    return this.candidates(spec, constraints)[0] ?? null;
  }

  /** Cheapest eligible cost estimate for a spec, for quoting before generation. */
  estimateCost(spec: GenerationSpec, constraints?: SelectionConstraints): number | null {
    const c = this.candidates(spec, constraints);
    if (!c.length) return null;
    return Math.min(...c.map((p) => p.estimateCost(spec).credits));
  }

  /** Best available quality tier for a spec. */
  estimateQuality(spec: GenerationSpec, constraints?: SelectionConstraints): number | null {
    const c = this.candidates(spec, constraints);
    if (!c.length) return null;
    return Math.max(...c.map((p) => p.capabilities().quality));
  }
}

/** A registry preloaded with the default reference providers. */
export function createDefaultRegistry(): ProviderRegistry {
  const reg = new ProviderRegistry();
  for (const p of defaultProviders()) reg.register(p);
  return reg;
}

// Process-wide singleton so API routes and services share one catalog.
let singleton: ProviderRegistry | null = null;
export function getRegistry(): ProviderRegistry {
  if (!singleton) singleton = createDefaultRegistry();
  return singleton;
}
