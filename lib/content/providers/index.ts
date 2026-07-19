import type { AssetKind } from "@/lib/creative/taxonomy";
import { MODALITY_FOR_KIND, type GenerationProvider, type Modality } from "@/lib/content/types";
import { ReferenceProvider } from "./base";

// Default reference providers. Vendor-neutral and deterministic — they exist so the
// registry/router/pipelines run out of the box. Adding a real provider = push a new
// GenerationProvider into the registry; none of these need to change.

/** Asset kinds that belong to a modality (derived from the single MODALITY_FOR_KIND map). */
export function kindsForModality(modality: Modality): AssetKind[] {
  return (Object.entries(MODALITY_FOR_KIND) as [AssetKind, Modality][])
    .filter(([, m]) => m === modality)
    .map(([k]) => k);
}

export function defaultProviders(): GenerationProvider[] {
  const imageKinds = kindsForModality("image");
  const videoKinds = kindsForModality("video");
  const docKinds = kindsForModality("document");
  const motionKinds = kindsForModality("motion");

  return [
    // Two image providers so cost/quality routing + fallback are real.
    new ReferenceProvider({
      id: "reference-image-hq", modality: "image", version: "1.0.0", ext: "png", basePixels: 2048,
      caps: { kinds: imageKinds, maxBatch: 8, supportsEdit: true, supportsUpscale: true, supportsVariations: true, quality: 0.92, speed: 0.5, costPerUnit: 4 },
    }),
    new ReferenceProvider({
      id: "reference-image-fast", modality: "image", version: "1.0.0", ext: "webp", basePixels: 1024,
      caps: { kinds: imageKinds, maxBatch: 4, supportsEdit: true, supportsUpscale: false, supportsVariations: true, quality: 0.72, speed: 0.9, costPerUnit: 1 },
    }),

    // Two video providers.
    new ReferenceProvider({
      id: "reference-video-cinematic", modality: "video", version: "1.0.0", ext: "mp4", basePixels: 1920,
      caps: { kinds: videoKinds, maxBatch: 2, supportsEdit: true, supportsUpscale: true, supportsVariations: true, quality: 0.9, speed: 0.4, costPerUnit: 20 },
    }),
    new ReferenceProvider({
      id: "reference-video-draft", modality: "video", version: "1.0.0", ext: "mp4", basePixels: 1280,
      caps: { kinds: videoKinds, maxBatch: 4, supportsEdit: true, supportsUpscale: false, supportsVariations: true, quality: 0.68, speed: 0.85, costPerUnit: 6 },
    }),

    // One each for motion, document, voice.
    new ReferenceProvider({
      id: "reference-motion", modality: "motion", version: "1.0.0", ext: "mp4", basePixels: 1080,
      caps: { kinds: motionKinds, maxBatch: 3, supportsEdit: true, supportsUpscale: false, supportsVariations: true, quality: 0.8, speed: 0.7, costPerUnit: 8 },
    }),
    new ReferenceProvider({
      id: "reference-document", modality: "document", version: "1.0.0",
      caps: { kinds: docKinds, maxBatch: 6, supportsEdit: true, supportsUpscale: false, supportsVariations: true, quality: 0.82, speed: 0.95, costPerUnit: 0.5 },
    }),
    new ReferenceProvider({
      id: "reference-voice", modality: "voice", version: "1.0.0", ext: "mp3", basePixels: 0,
      caps: { kinds: [], maxBatch: 4, supportsEdit: true, supportsUpscale: false, supportsVariations: true, quality: 0.85, speed: 0.9, costPerUnit: 2 },
    }),
  ];
}

export { ReferenceProvider } from "./base";
