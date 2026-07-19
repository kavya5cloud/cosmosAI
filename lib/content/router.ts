import type {
  GenerationRequest, GenerationResult, GenerationSpec, ProviderOutput,
} from "@/lib/content/types";
import { ProviderRegistry, type SelectionConstraints } from "@/lib/content/registry";
import { promptHashOf } from "@/lib/content/providers/base";

// Generation Router — the orchestration core. Chooses a provider (via the registry),
// caches results, retries transient failures, falls back across the candidate chain,
// optimizes for cost, and supports batching + progress streaming. NO UI logic and no
// vendor names — it only speaks the provider interface.

export interface CacheStore {
  get(key: string): ProviderOutput | undefined;
  set(key: string, value: ProviderOutput): void;
  clear(): void;
  size(): number;
}

/** Default in-memory LRU-ish cache (bounded). Swap for Redis etc. via the interface. */
export class InMemoryCache implements CacheStore {
  private map = new Map<string, ProviderOutput>();
  constructor(private max = 500) {}
  get(key: string) {
    const v = this.map.get(key);
    if (v) { this.map.delete(key); this.map.set(key, v); } // bump recency
    return v;
  }
  set(key: string, value: ProviderOutput) {
    this.map.set(key, value);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
  }
  clear() { this.map.clear(); }
  size() { return this.map.size; }
}

export type RouterOptions = {
  registry: ProviderRegistry;
  cache?: CacheStore;
  maxAttempts?: number; // across the fallback chain
};

function cacheKey(spec: GenerationSpec, providerId: string): string {
  return `${providerId}:${spec.modality}:${spec.kind}:${promptHashOf(spec)}`;
}

/** Kind-agnostic cache key (any eligible provider can satisfy it) — used for read hits. */
function sharedKey(spec: GenerationSpec): string {
  return `*:${spec.modality}:${spec.kind}:${promptHashOf(spec)}`;
}

export class GenerationRouter {
  private registry: ProviderRegistry;
  private cache: CacheStore;
  private maxAttempts: number;

  constructor(opts: RouterOptions) {
    this.registry = opts.registry;
    this.cache = opts.cache ?? new InMemoryCache();
    this.maxAttempts = opts.maxAttempts ?? 3;
  }

  getCache(): CacheStore { return this.cache; }
  getRegistry(): ProviderRegistry { return this.registry; }

  /** Quote the cheapest eligible cost without generating. */
  quote(spec: GenerationSpec, constraints?: SelectionConstraints): number | null {
    return this.registry.estimateCost(spec, constraints);
  }

  /**
   * Edit a prior output. Routes to a provider that supports editing (preferring the one
   * that produced it), falling back across the candidate chain. Never cached.
   */
  async edit(req: GenerationRequest, instruction: string, base: ProviderOutput): Promise<GenerationResult> {
    const spec = req.spec;
    const requestId = req.id ?? `edit_${promptHashOf(spec)}`;
    const candidates = this.registry
      .candidates(spec, { preferProviderId: req.constraints?.preferProviderId, excludeProviderIds: req.constraints?.excludeProviderIds })
      .filter((p) => p.capabilities().supportsEdit);
    if (candidates.length === 0) throw new Error(`no_editor_available for ${spec.modality}/${spec.kind}`);

    const attempts: GenerationResult["attempts"] = [];
    let lastErr = "";
    const budget = Math.min(this.maxAttempts, candidates.length);
    for (let i = 0; i < budget; i++) {
      const provider = candidates[i];
      const started = Date.now();
      try {
        const output = await provider.edit(spec, { base, instruction }, req.options);
        attempts.push({ providerId: provider.id, ok: true });
        return {
          requestId, modality: spec.modality, kind: spec.kind,
          providerId: provider.id, providerVersion: provider.version, output,
          cost: provider.estimateCost(spec, req.options), latencyMs: Date.now() - started,
          promptHash: promptHashOf(spec), cached: false, attempts,
        };
      } catch (e) {
        lastErr = String(e).slice(0, 200);
        attempts.push({ providerId: provider.id, ok: false, error: lastErr });
      }
    }
    throw new Error(`edit_failed after ${attempts.length} attempt(s): ${lastErr}`);
  }

  /**
   * Generate one asset. Tries the registry's ordered candidates, caching, retrying and
   * falling back until one succeeds or the chain/attempt budget is exhausted.
   */
  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const spec = req.spec;
    const requestId = req.id ?? `gen_${promptHashOf(spec)}`;
    const constraints: SelectionConstraints = {
      minQuality: req.constraints?.minQuality,
      maxCredits: req.constraints?.maxCredits,
      preferProviderId: req.constraints?.preferProviderId,
      excludeProviderIds: req.constraints?.excludeProviderIds,
      optimizeFor: req.constraints?.maxCredits != null ? "balanced" : "quality",
    };

    const candidates = this.registry.candidates(spec, constraints);
    if (candidates.length === 0) {
      throw new Error(`no_provider_available for ${spec.modality}/${spec.kind}`);
    }

    // Cache read: any prior successful output for this spec (shared across providers).
    const shared = sharedKey(spec);
    const cached = this.cache.get(shared);
    const attempts: GenerationResult["attempts"] = [];

    if (cached) {
      const top = candidates[0];
      return {
        requestId, modality: spec.modality, kind: spec.kind,
        providerId: top.id, providerVersion: top.version, output: cached,
        cost: { credits: 0, unit: "cached", basis: "cache hit" },
        latencyMs: 0, promptHash: promptHashOf(spec), cached: true,
        attempts: [{ providerId: top.id, ok: true }],
      };
    }

    let lastErr = "";
    const budget = Math.min(this.maxAttempts, candidates.length);
    for (let i = 0; i < budget; i++) {
      const provider = candidates[i];
      req.options?.onProgress?.({ phase: `provider:${provider.id}`, pct: 0 });
      const started = Date.now();
      try {
        const output = await provider.generate(spec, req.options);
        const latencyMs = Date.now() - started;
        attempts.push({ providerId: provider.id, ok: true });
        this.cache.set(cacheKey(spec, provider.id), output);
        this.cache.set(shared, output);
        req.options?.onProgress?.({ phase: "done", pct: 100 });
        return {
          requestId, modality: spec.modality, kind: spec.kind,
          providerId: provider.id, providerVersion: provider.version, output,
          cost: provider.estimateCost(spec, req.options),
          latencyMs, promptHash: promptHashOf(spec), cached: false, attempts,
        };
      } catch (e) {
        lastErr = String(e).slice(0, 200);
        attempts.push({ providerId: provider.id, ok: false, error: lastErr });
        // fall through to the next candidate (fallback)
      }
    }
    const err = new Error(`generation_failed after ${attempts.length} attempt(s): ${lastErr}`);
    (err as Error & { attempts?: unknown }).attempts = attempts;
    throw err;
  }

  /** Batch generate — independent requests run concurrently, order preserved. */
  async batch(reqs: GenerationRequest[]): Promise<PromiseSettledResult<GenerationResult>[]> {
    return Promise.allSettled(reqs.map((r) => this.generate(r)));
  }

  /**
   * Streaming variant: yields progress events then the final result. Callers that want a
   * plain result use generate(); UIs consume this async iterator.
   */
  async *stream(req: GenerationRequest): AsyncGenerator<
    { type: "progress"; phase: string; pct: number } | { type: "result"; result: GenerationResult },
    void, unknown
  > {
    const events: { phase: string; pct: number }[] = [];
    const options = { ...req.options, onProgress: (p: { phase: string; pct: number }) => events.push(p) };
    const p = this.generate({ ...req, options });
    // Emit a start event immediately; provider work is fast/synchronous here, so we
    // await then flush collected progress before the result.
    yield { type: "progress", phase: "queued", pct: 0 };
    const result = await p;
    for (const e of events) yield { type: "progress", phase: e.phase, pct: e.pct };
    yield { type: "result", result };
  }
}

/** Convenience factory using the default registry. */
export function createRouter(registry: ProviderRegistry, cache?: CacheStore): GenerationRouter {
  return new GenerationRouter({ registry, cache });
}

// Process-wide cache so generation results are reused across requests (not just within
// a single router instance). Swap the whole store by wiring a different CacheStore.
let sharedCache: CacheStore | null = null;
export function getSharedCache(): CacheStore {
  if (!sharedCache) sharedCache = new InMemoryCache();
  return sharedCache;
}
