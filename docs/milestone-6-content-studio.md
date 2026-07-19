# Milestone 6 — Content Studio (generation orchestration)

The provider-agnostic layer that plans, routes, generates, evaluates and stores every
creative asset. **Populr owns the orchestration; providers are replaceable adapters.**
No business logic ever names a vendor, and no image/video model is built here — only the
interfaces, registry, router and pipelines that can drive *any* provider.

```
Creative Brief → Asset Planner → Spec → Provider Registry → Generation Router
     → Provider (adapter) → Creative Council → Approval → Asset Graph
     → Generation History + Media Library
```

Everything is deterministic and runs out of the box on **reference providers**
(vendor-neutral, synthetic output) so the whole layer is testable with no network or DB.
Swapping in a real provider = registering a new `GenerationProvider`; nothing else changes.

## Part 1 — Generation abstraction (`lib/content/types.ts`, `providers/`)

`GenerationProvider<Spec>` — every adapter exposes `generate · edit · upscale ·
variations · estimateCost · estimateLatency · capabilities` (plus `isAvailable`).
Modality-typed aliases: `ImageProvider · VideoProvider · DocumentProvider ·
VoiceProvider · MotionProvider`. Specs (`ImageSpec`, `VideoSpec`, …) are vendor-neutral;
`ProviderOutput` carries text content and/or `MediaRef`s with opaque `populr://` URIs.
`providers/base.ts` is a fully-working `ReferenceProvider`; `providers/index.ts` ships
the default set (2 image, 2 video, 1 motion/document/voice).

## Part 2 — Provider Registry (`lib/content/registry.ts`)

Register / lookup by kind + modality, cost + quality estimation, availability,
versioning (re-registering an id swaps the adapter live), and **candidate ordering** —
the fallback chain. `candidates(spec, constraints)` applies quality floors, cost caps,
prefer/exclude and availability, then sorts by objective (`quality | cost | speed |
balanced`). A process singleton (`getRegistry()`) is shared by the routes.

## Part 3 — Generation Router (`lib/content/router.ts`)

Chooses a provider via the registry, then handles **caching** (`CacheStore` interface +
in-memory LRU), **retry + fallback** across the candidate chain, **cost optimization**
(switches to `balanced` under a `maxCredits` cap), **batch** (`batch()`), **streaming /
progress** (`stream()` async generator), and **edit** routing. No UI logic, no vendor names.

## Parts 4–8 — Content Studio + pipelines (`studio.ts`, `pipeline.ts`)

`ContentStudio` is the single facade for the eight sections — **Launch, Images, Videos,
UGC, Motion Graphics, Documents, Ads, Asset Library**. Each section runs
`runContentPipeline`:

`buildSpec(brief, kind)` → router.generate → `runCouncil` evaluation → approval verdict
→ **Asset Graph** (`recordGeneratedAsset`) → **Media Library** + **Generation History**.

`launch()` plans the full asset set with the Asset Planner, then generates one asset per
distinct kind. Image/Video/UGC/Document pipelines all share this path; the spec builder
specializes per modality (aspect ratio, duration, script, sections…).

## Part 9 — Generation History (`lib/content/history.ts`)

Immutable record of every generation: provider, version, cost, latency, prompt hash,
cached flag, brief, mission, campaign, asset root, approval, council score, performance.
Repository pattern — `InMemoryHistoryRepo` (tests/dev) + `NeonHistoryRepo` (prod).
`attachOutcome` is the only mutation (approval / performance), never a delete.

## Part 10 — Media Library (`lib/content/media.ts`)

Searchable store of images, videos, audio, templates, characters, logos, fonts, brand
assets and motion assets. `InMemoryMediaRepo` + `NeonMediaRepo`; search by type, tag and
free text over title/tags.

## Part 11 — APIs

| Method | Path | Purpose |
| ------ | ---- | ------- |
| POST | `/api/content/generate` | Plan + route + generate + evaluate + store an asset. |
| POST | `/api/content/edit` | Edit a prior output through an edit-capable provider. |
| GET | `/api/content/history` | Workspace generation history (filterable). |
| GET | `/api/providers` | Registered providers + capabilities. |
| GET | `/api/providers/capabilities` | Capabilities, filterable by `modality` / `kind`. |
| GET | `/api/providers/status` | Availability + per-modality coverage. |
| GET / POST | `/api/media` | Search / register media-library assets. |

## Part 12 — Tests

`content-providers`, `content-registry`, `content-router` (caching, fallback, cost,
batch, streaming, edit), `content-history`, `content-media`, `content-pipeline`
(end-to-end studio, launch, determinism, dry-run). All deterministic; no network/DB.

## Schema

`db/migrations/20260720_milestone_6.sql` adds `generation_events` + `media_assets`
(workspace-scoped, additive). Migrations own schema; runtime `ensure*` guards mirror it
for dev/test.

## Guarantees

- **No hardcoded provider logic** — vendors never named; all selection is capability-driven.
- **Providers are swappable** — implement `GenerationProvider`, register it; registry,
  router, pipelines and APIs are untouched.
- Repository pattern for history + media; deterministic reference providers; strong typing throughout.
- Additive: no existing route, schema or behavior changed.
