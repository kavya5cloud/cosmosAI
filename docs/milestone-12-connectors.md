# Milestone 12 — Integration & Connector Platform

The data-ingestion layer. Connectors continuously collect business signals from external
systems and turn them into standardized **Business Events** — the fuel for the Business
Graph, Learning Engine, Decision Planner, Pattern Library, Brand DNA and Creative Memory.

**Connectors never make decisions and never modify business objects.** They only collect,
normalize and publish events. The Business Event is the *only* integration contract.

```
External Platform → Connector Adapter → Normalization → Business Event → Event Bus
   → Business Graph · Learning Engine · Decision Planner
```

## Layout — `lib/connectors/`

| File | Responsibility |
| ---- | -------------- |
| `types.ts` | `Connector` interface, `BusinessEvent` (12 types), `NormalizedPayload` (8 kinds), capabilities/status/health, sync tracking |
| `normalize.ts` | Normalization layer — provider aliases → canonical metrics/dimensions (the only place raw shapes are seen) |
| `connectors.ts` | 17 deterministic **reference adapters** (GA, GSC, Google/Meta Ads, LinkedIn, X, YouTube, TikTok, Stripe, HubSpot, Salesforce, Shopify, Notion, Slack, GitHub, Drive, Figma) |
| `registry.ts` | Connector Registry — register, capability lookup, health, rate limits, versions, availability, category fallback |
| `event-bus.ts` | Business Event Bus — publish/subscribe/replay/**dedupe**/**ordering**/retry/**dead-letter**/idempotency |
| `sync-engine.ts` | Sync Engine — scheduled/manual/incremental/historical, health checks, retry+backoff; tracks last/next/duration/records/errors |
| `bridge.ts` | Downstream subscribers — Learning + Business Graph **consume** Business Events (event-driven, no direct writes) |
| `store.ts` | History — `business_events` / `connectors` / `sync_history` (in-memory + Neon, append-only) |

## Business Events & normalization

Every signal becomes a `BusinessEvent { id, tenant, connector, timestamp, source, entity,
type, payload (raw), normalizedPayload, confidence, version }`. The `normalizedPayload`
carries a canonical `{ kind, entity, metrics, dimensions }` — downstream services consume
**only** this, never a provider-specific shape. 12 event types map onto 8 normalized kinds
(traffic, revenue, lead, campaign, seo, social, performance, customer).

## Architectural rule (Part 12)

No connector writes to the Business Graph, Learning Engine, Decision Planner, Pattern
Library, Brand DNA or Creative Memory. Those subscribe to the bus (`bridge.ts`):
performance-bearing events map to Learning `PerformanceEvent`s; revenue/lead/SEO signals
are collected as Business Graph signals. Swapping a real provider in requires **zero**
changes to any business logic — only the connector adapter changes.

## APIs

`GET /api/connectors`, `/api/connectors/connect`, `/disconnect`, `/sync`, `/status`,
`/events`, `/history`.

## Dashboard

`/studio/integrations` — connected services + connection/health/sync status, latest
Business Events, sync history. Connect + Sync are live.

## Database

Migration `db/migrations/20260726_milestone_12.sql`: `business_events`, `connectors`,
`sync_history` (indexed, append-only).

## Tests

`tests/connectors-platform.test.ts` + `tests/connectors-bus-sync.test.ts` — all 17
connectors + interface, deterministic polling/normalization, connect/health lifecycle,
webhooks, historical vs incremental, registry capability/fallback, event bus
dedupe/ordering/replay/dead-letter, downstream bridge mapping, sync run + retry/backoff +
syncAll metrics. 18 deterministic tests.
