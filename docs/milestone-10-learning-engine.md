# Milestone 10 — Learning Engine

The engine that makes Populr **measurably smarter after every campaign**. Performance
events in; structured intelligence out. **Deterministic — no LLMs in the learning loop.**
Additive; it feeds the *existing* Creative Memory, Business Graph and Decision Planner.

```
… Publishing → Performance Collection → Learning Engine →
   Business Graph Update · Brand DNA Update · Pattern Library Update ·
   Creative Memory Update · Decision Planner Update
```

## Layout — `lib/learning/`

| File | Responsibility |
| ---- | -------------- |
| `types.ts` | `PerformanceEvent` (unified schema), `Pattern`, `BrandDNA`, `BusinessGraphSignal`, `DecisionFeedback`, insights |
| `performance.ts` | Ingest any platform → unified schema (aliases), deterministic score, aggregation, best posting hour |
| `patterns.ts` | **Pattern Library** — extract winners → hooks/stories/CTAs/headlines/layouts/motion/UGC/video/image styles/launch sequences/posting times; versioned; repo |
| `brand-dna.ts` | **Brand DNA evolution** — 8 traits with confidence; never overwrite, always version |
| `business-graph-evolution.ts` | Versioned business-graph **signals** (channel/audience/campaign/performance) — enriches without mutating the canonical projection |
| `decision-feedback.ts` | **Decision loop** — prediction vs actual → deviation, quality, accuracy trend |
| `insights.ts` | Ranked, evidence-backed insight feed |
| `engine.ts` | **Learning Engine** — orchestrates aggregate → patterns → brand → creative memory → graph signals → insights |

## Performance ingestion (Part 2)

One schema for every platform: `views, reach, ctr, watch_time, conversions, revenue,
shares, comments, likes, bookmarks, time_on_page, email_opens, replies`. Common platform
aliases (`impressions→reach`, `reposts→shares`, `sales→revenue`, …) normalize in.
`performanceScore` is a pure saturating-weighted function — conversions/revenue outweigh
reach — so identical metrics always yield an identical score.

## Reuse (no duplication)

- **Creative Memory** — the Milestone 8 `CreativeMemoryStore` is auto-updated by the
  engine (winning + underperforming assets, tagged + searchable). No new memory store.
- **Business Graph** — enriched via versioned signals, not a rewrite of `business-graph.ts`.
- **Decision Planner** — the feedback loop scores its predictions; accuracy trends up as
  evidence accumulates.

## Guarantees

- **Deterministic** — every store update and insight is a pure function of the events
  (ids included). Tests assert byte-identical results across runs.
- **Versioned, never overwritten** — Brand DNA, patterns and graph signals keep history
  and blend confidence by accumulated evidence.
- **No LLMs** — all learning logic is arithmetic + mapping.

## APIs (`/api/learning/*`)

`events` (ingest), `patterns`, `brand`, `memory`, `insights`, `dashboard`.

## Learning Dashboard

`/studio/learning` — Top Patterns, Learning Feed, Brand Evolution, Creative & Campaign
Insights, Decision Accuracy, Winning Hooks, Winning Assets, Recommendations. Rendered from
a real Learning Engine run over deterministic sample events.

## Persistence

Migration `db/migrations/20260724_milestone_10.sql` adds `learn_patterns`,
`learn_brand_dna`, `learn_bg_signals`, `learn_decision_feedback` (creative memory reuses
`ci_creative_memory`). Repository pattern (in-memory default, Neon in prod).

## Tests

`tests/learning-performance-patterns.test.ts`, `tests/learning-brand-decision.test.ts`,
`tests/learning-engine.test.ts` — ingestion/aliases/scoring/aggregation, pattern
extraction + versioning, brand evolution, business-graph signals, decision accuracy +
trend, and the full engine orchestration (including "gets smarter across runs"). 15
deterministic tests.
