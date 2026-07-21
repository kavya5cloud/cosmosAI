# Milestone 11 — Job Orchestration Engine

The central execution layer. **Every AI request becomes a Job**; no feature calls a
provider directly anymore. A job flows through the pipeline and updates the whole system:

```
User Request → Job → Planning → Creative Intelligence → Generation →
   Creative Director Review → Approval → Publishing (optional) → Learning → Completed
```

Additive — jobs orchestrate the existing engines (Creative Intelligence, Creative Director,
Publishing, Learning); nothing was redesigned.

## Layout — `lib/jobs/`

| File | Responsibility |
| ---- | -------------- |
| `types.ts` | `Job`, `JobType` (13), `JobState` (pipeline + control), events, logs, progress, worker + queue metrics |
| `pipeline.ts` | Per-type stage flow (`stagesFor`), transitions, percent, state labels |
| `events.ts` | `JobEventBus` — every transition emits a `JobEvent` (event-sourced) |
| `queue.ts` | **Queue Manager** — priority, scheduling, wait estimate, position, backpressure, rate limiting, provider cooldown, high-load routing |
| `worker.ts` | **Worker pool** — parallel execution, concurrency limits, retry re-queueing, dead-letter, timeouts, graceful shutdown |
| `handlers.ts` | Stage runners — delegate to the existing engines (Creative Intelligence spec, Creative Director council, publishing, learning). No provider bypass. |
| `engine.ts` | **Job Engine** — create/schedule/execute/retry/cancel/pause/resume, progress, logs, cost, metrics; idempotency; resume cursor |
| `store.ts` | History store — jobs / job_events / job_logs (in-memory + Neon, append-only) |

## Pipeline & states

Pipeline: `queued → waiting_for_resources → planning → creative_intelligence → generating
→ creative_director_review → approval → [publishing] → learning_update → completed`.
Control/terminal: `retrying, paused, cancelled, failed, timed_out`. Every job carries the
concrete `stages` it flows through (planning-only jobs skip generation; publishing is opt-in).

## Guarantees

- **Nothing bypasses the engine** — features enqueue jobs; handlers run the real pipeline.
- **Event-driven** — every transition/progress tick emits a `JobEvent`.
- **Resilient** — retries (with a resume cursor), dead-letter queue, timeouts, backpressure,
  idempotency keys, cancel/pause/resume. Built for long-running jobs (video/motion).
- **Deterministic** — with an injectable clock, identical input → identical job outcome
  (refs, cost, state). Tests assert it.

## Real-time progress (Part 7 & 12)

`GET /api/jobs/{id}/events` is **Server-Sent Events** (replays past events, streams new
ones, closes on terminal) with a `?poll=1` JSON fallback. The Global AI Processing
Experience now accepts a `jobId` and renders **real** job stages/percent/queue-position via
`useJobProgress` — it only simulates when no job is attached. Studio "Generate" creates a
real job and the overlay reflects its live execution.

## APIs

`POST/GET /api/jobs`, `/api/jobs/{id}`, `/api/jobs/{id}/events`, `/api/jobs/{id}/logs`,
`/api/jobs/{id}/{cancel,pause,resume,retry}`, `/api/jobs/dashboard`.

## Execution Dashboard

`/studio/jobs` — running/queued/completed/failed, retry queue, dead-letter, worker health,
avg duration + cost, provider usage, system load and the live job list. Seeds a few jobs
then polls real execution.

## Database

Migration `db/migrations/20260725_milestone_11.sql`: `jobs`, `job_events`, `job_logs`,
`worker_status`, `queue_metrics` (indexed, append-only event history).

## Tests

`tests/jobs-engine.test.ts` + `tests/jobs-concurrency.test.ts` — pipeline flows, full
lifecycle, refs/cost/metrics, idempotency, cancel/pause/resume, retry + dead-letter,
recovery within budget, determinism, queue priority/backpressure/cooldown, worker
concurrency + graceful shutdown. 17 deterministic tests.

## Note on serverless execution

The engine runs jobs in-process (background `drain()`), which fits dev + a single Node
process. The architecture (durable queue, event log, resume cursor, idempotency, DLQ) is
designed so a production deployment can move `drain()` onto a durable worker/queue without
touching callers or the API.
