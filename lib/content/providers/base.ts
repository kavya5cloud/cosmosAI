import type {
  Capabilities, CostEstimate, EditInstruction, GenerateOptions, GenerationProvider,
  GenerationSpec, LatencyEstimate, MediaRef, Modality, ProviderOutput,
} from "@/lib/content/types";

// Shared, deterministic machinery for reference providers. These adapters produce
// SYNTHETIC output (no vendor, no network) so the whole orchestration layer runs and
// tests end-to-end. Real adapters swap in by implementing GenerationProvider — nothing
// in the registry, router or pipelines changes.

/** Stable, dependency-free hash (djb2) — deterministic across environments. */
export function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

export function promptHashOf(spec: GenerationSpec): string {
  return hash(JSON.stringify({ kind: spec.kind, modality: spec.modality, prompt: spec.prompt, hints: spec.hints ?? {} }));
}

/** Deterministic, vendor-neutral media locator. */
export function mediaUri(modality: Modality, seed: string, ext: string): string {
  return `populr://media/${modality}/${hash(seed)}.${ext}`;
}

function dims(aspect: string | undefined, base: number): { width: number; height: number } {
  const [w, h] = (aspect ?? "1:1").split(":").map((n) => Number(n) || 1);
  const scale = base / Math.max(w, h);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

/** Config that specializes a reference provider without changing its behavior. */
export type ReferenceConfig = {
  id: string;
  modality: Modality;
  version: string;
  caps: Omit<Capabilities, "modality">;
  /** ext + base pixel size for synthetic media (unused for documents). */
  ext?: string;
  basePixels?: number;
  /** Availability toggle for tests / status. */
  available?: boolean;
};

/**
 * A fully-working reference provider. Deterministic: identical spec → identical output.
 * Concrete "real" providers won't extend this — they just implement GenerationProvider —
 * but it proves the contract and powers local/dev/test generation.
 */
export class ReferenceProvider implements GenerationProvider {
  readonly id: string;
  readonly modality: Modality;
  readonly version: string;
  private cfg: ReferenceConfig;
  private _available: boolean;

  constructor(cfg: ReferenceConfig) {
    this.cfg = cfg;
    this.id = cfg.id;
    this.modality = cfg.modality;
    this.version = cfg.version;
    this._available = cfg.available ?? true;
  }

  capabilities(): Capabilities {
    return { modality: this.modality, ...this.cfg.caps };
  }

  isAvailable(): boolean {
    return this._available;
  }

  /** Test/ops hook to flip availability (drives fallback + status). */
  setAvailable(v: boolean): void {
    this._available = v;
  }

  private unitCount(spec: GenerationSpec, opts?: GenerateOptions): number {
    const req = opts?.count ?? (spec.modality === "image" ? spec.count : undefined) ?? 1;
    return Math.max(1, req);
  }

  private makeMedia(spec: GenerationSpec, seed: string, opts?: GenerateOptions): MediaRef[] {
    if (this.modality === "document") return [];
    const ext = this.cfg.ext ?? "bin";
    const count = this.unitCount(spec, opts);
    const { width, height } = dims("aspectRatio" in spec ? spec.aspectRatio : undefined, this.cfg.basePixels ?? 1024);
    const durationSec = "durationSec" in spec ? spec.durationSec : undefined;
    return Array.from({ length: count }, (_, i) => ({
      uri: mediaUri(this.modality, `${seed}:${i}`, ext),
      mime: mimeFor(this.modality, ext),
      bytes: 1024 * (10 + (hashInt(`${seed}:${i}`) % 90)),
      width: this.modality === "voice" ? undefined : width,
      height: this.modality === "voice" ? undefined : height,
      durationMs: durationSec ? Math.round(durationSec * 1000) : (this.modality === "video" || this.modality === "motion" || this.modality === "voice" ? 15000 : undefined),
    }));
  }

  private makeContent(spec: GenerationSpec): string {
    // Deterministic structured document body from the spec + brief.
    const lines: string[] = [];
    const title = spec.hints?.title ?? spec.kind.replace(/_/g, " ");
    lines.push(`# ${title}`);
    if (spec.brief) {
      lines.push("", `Audience: ${spec.brief.audience}`, `Key message: ${spec.brief.keyMessage}`, "");
    }
    lines.push(spec.prompt);
    if (spec.modality === "document" && spec.sections?.length) {
      for (const s of spec.sections) lines.push("", `## ${s}`, `${s} content grounded in the brief.`);
    }
    return lines.join("\n");
  }

  async generate(spec: GenerationSpec, opts?: GenerateOptions): Promise<ProviderOutput> {
    opts?.onProgress?.({ phase: "generate", pct: 100 });
    const seed = `${this.id}:${promptHashOf(spec)}`;
    if (this.modality === "document") return { content: this.makeContent(spec), meta: { seed } };
    if (this.modality === "voice") {
      return { content: (spec as { script?: string }).script ?? spec.prompt, media: this.makeMedia(spec, seed, opts), meta: { seed } };
    }
    return { media: this.makeMedia(spec, seed, opts), meta: { seed } };
  }

  async edit(spec: GenerationSpec, edit: EditInstruction, opts?: GenerateOptions): Promise<ProviderOutput> {
    opts?.onProgress?.({ phase: "edit", pct: 100 });
    const seed = `${this.id}:edit:${promptHashOf(spec)}:${hash(edit.instruction)}`;
    if (this.modality === "document") {
      return { content: `${edit.base.content ?? ""}\n\n<!-- edit: ${edit.instruction} -->`, meta: { seed, edited: true } };
    }
    return { media: this.makeMedia(spec, seed, opts), meta: { seed, edited: true } };
  }

  async upscale(output: ProviderOutput, opts?: GenerateOptions): Promise<ProviderOutput> {
    opts?.onProgress?.({ phase: "upscale", pct: 100 });
    if (!output.media?.length) return output;
    const media = output.media.map((m) => ({
      ...m,
      uri: mediaUri(this.modality, `${m.uri}:2x`, this.cfg.ext ?? "bin"),
      width: m.width ? m.width * 2 : m.width,
      height: m.height ? m.height * 2 : m.height,
      bytes: m.bytes ? m.bytes * 4 : m.bytes,
    }));
    return { ...output, media, meta: { ...output.meta, upscaled: true } };
  }

  async variations(spec: GenerationSpec, output: ProviderOutput, count: number, opts?: GenerateOptions): Promise<ProviderOutput> {
    opts?.onProgress?.({ phase: "variations", pct: 100 });
    const seed = `${this.id}:var:${promptHashOf(spec)}`;
    return { media: this.makeMedia(spec, seed, { ...opts, count: Math.max(1, count) }), meta: { seed, variations: count } };
  }

  estimateCost(spec: GenerationSpec, opts?: GenerateOptions): CostEstimate {
    const units = this.modality === "document"
      ? 1
      : this.modality === "video" || this.modality === "motion" || this.modality === "voice"
        ? Math.max(1, ("durationSec" in spec && spec.durationSec ? spec.durationSec : 15) / 5) // per 5s
        : this.unitCount(spec, opts);
    return {
      credits: Math.round(this.cfg.caps.costPerUnit * units * 100) / 100,
      unit: this.modality === "document" ? "document" : this.modality === "image" ? "image" : "5s",
      basis: `${this.cfg.caps.costPerUnit}/unit × ${units}`,
    };
  }

  estimateLatency(spec: GenerationSpec, opts?: GenerateOptions): LatencyEstimate {
    const base = { image: 2500, video: 45000, motion: 20000, voice: 6000, document: 1500 }[this.modality];
    const units = this.unitCount(spec, opts);
    const dur = "durationSec" in spec && spec.durationSec ? spec.durationSec : 15;
    const sizeFactor = this.modality === "video" || this.modality === "motion" ? dur / 15 : 1;
    const ms = Math.round((base * sizeFactor * units) * (1.3 - this.cfg.caps.speed * 0.6));
    return { ms, basis: `base ${base}ms × ${units} × speed ${this.cfg.caps.speed}` };
  }
}

function hashInt(s: string): number {
  return parseInt(hash(s).slice(0, 6), 16);
}

function mimeFor(modality: Modality, ext: string): string {
  if (modality === "voice") return "audio/" + ext;
  if (modality === "video" || modality === "motion") return "video/" + ext;
  if (modality === "image") return "image/" + ext;
  return "application/octet-stream";
}
