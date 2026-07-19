# Milestone 5 — Creative Foundation

The scaffolding every future Creative Studio feature plugs into. This milestone adds
the **Early Access program**, the **Creative Studio navigation shell**, and the
deterministic **Asset Planner → Creative Director → Approval Council** pipeline. It is
entirely additive — no existing system was redesigned, and generation is intentionally
not wired yet.

```
Business Graph → Decision → Mission → Campaign → Creative Brief
                                                        │
                                                        ▼
                                                  Asset Planner        (lib/creative/asset-planner.ts)
                                                        │
                                                        ▼
                                              Creative Director         (lib/creative/evaluators/*)
                                                        │
                                                        ▼
                                               Approval Council         (lib/creative/council/*)
                                                        │
                                                        ▼
                                             (Content Generation later)
```

Everything below the Creative Brief is **deterministic and server-side** — no LLM, no
browser prompt assembly. Generation, when it lands, must enter through
`runCreativePipeline` so no asset can bypass planning + review.

## Part 1 — Early Access

- **Rotating banner** (`app/components/EarlyAccessBanner.tsx`), mounted globally in the
  root layout. Four slides rotate every ~5.5s (paused on hover / when the modal is open),
  each with an **Apply for Early Access** button.
- **Modal**: required **Work Email**; optional Company, Website, Team Size, "What are you
  building?"; and five interest checkboxes (Launch Videos, UGC Videos, Motion Graphics,
  AI Creative Studio, AI Campaigns).
- **Backend**: `POST /api/early-access` persists `email, company, website, team_size,
  project, interests, created_at`. Duplicate emails are idempotently upserted (a repeat
  submit never wipes prior data or resets status). Email is best-effort through a new
  **provider abstraction** (`lib/services/email.ts`) so Resend / Mailchimp / etc. can be
  swapped via `EMAIL_PROVIDER` without touching call sites.
- **Schema**: migration `db/migrations/20260719_milestone_5.sql` makes `name` nullable
  and adds `team_size`, `project`, `interests`. No runtime DDL in production.

## Part 2 — Creative Studio navigation

`/studio` shell (`app/studio/layout.tsx` + `StudioNav.tsx`) with sections **Launch,
Videos, UGC, Motion Graphics, Images, Documents, Ads, Asset Library**. Sections read the
shared **taxonomy** (`lib/creative/taxonomy.ts`) so nav and content never drift.
Placeholder cards, fully responsive (sidebar → horizontal scroller on mobile). The
Launch page renders a **real** deterministic Asset Plan (same `planAssets()` the API uses).

## Part 3 — Asset Planner (`lib/creative/asset-planner.ts`)

`planAssets(input) → AssetPlan`. Pure function of Mission + Campaign + Creative Brief.
Ordered goal templates (launch/seo/viral/leads/hiring/fundraising + default) define the
production sequence; campaign channels add any missing distribution assets; stages
(foundation → amplification → distribution → conversion), 1-based order, derivation
`dependsOn` edges, per-asset rationale and quantities are all computed deterministically.
`POST /api/creative/plan` (by `campaignId` from the pipeline, or inline) returns the plan.

## Part 4 — Creative Director (`lib/creative/evaluators/`)

Eight **independent** deterministic evaluators, each `(subject, ctx) → { score,
confidence, reason, recommendations }`:

`brand_alignment · mission_alignment · campaign_alignment · platform_suitability ·
readability · originality · completeness · claim_verification`

Each lives in its own file and can be run in isolation; `evaluateAll` runs the panel.

## Part 5 — Creative Council (`lib/creative/council/`)

Six reviewer personas — **Brand Guardian, Story, Copy, Visual, Platform, Performance** —
each composing a weighted subset of the evaluators into `{ score, issues, suggestions,
confidence }`. The **Approval Council** (`runCouncil`) aggregates the weighted votes into
a verdict: **APPROVED / REVISION_REQUIRED / REJECTED** with deterministic reasoning and
the full evidence trail (every reviewer + evaluator result + blocking issues).
`POST /api/creative/evaluate` runs it over a candidate asset.

Thresholds: approve ≥ 0.75 with zero high-severity issues; reject < 0.5 or ≥ 2 blocking
issues; otherwise revision.

## Part 6 — Integration (`lib/creative/pipeline.ts`)

The single orchestration seam: `campaignToPlannerInput`, `normalizeBrief`,
`evaluationContext`, and `runCreativePipeline(input, subject)` which plans + reviews in
one call. `getCampaign(sql, wsKey, id)` (new, workspace-scoped) is the bridge from the
existing campaign store into the planner.

## APIs

| Method | Path | Purpose |
| ------ | ---- | ------- |
| POST | `/api/early-access` | Capture an application (email required; interests). |
| POST | `/api/creative/plan` | Deterministic Asset Plan (by campaignId or inline). |
| POST | `/api/creative/evaluate` | Creative Director + Approval Council verdict. |

## Tests

`tests/creative-planner.test.ts`, `tests/creative-evaluators.test.ts`,
`tests/creative-council.test.ts`, `tests/creative-pipeline.test.ts`,
`tests/early-access.test.ts` — planner sequencing/dependencies/determinism, per-evaluator
behavior, council verdicts + aggregation, end-to-end pipeline, and Early Access
validation + email fallback.

## Guarantees

- Additive only; existing routes, schema and behavior unchanged.
- Strong typing throughout (`lib/creative/types.ts` is the shared contract).
- Deterministic: identical inputs → byte-identical plans and decisions.
- Repository/service/API layering preserved; migrations own schema; no runtime DDL in prod.
