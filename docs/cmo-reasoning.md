# CMO Reasoning Pipeline

How Populr's AI stops sounding like ChatGPT. This is not a prompt change — it's a
change to *what the model is allowed to think about, and in what order*.

## 1. Root cause — why it sounded generic

The chat prompt was assembled **100% client-side** (`buildChatPrompt` in the app) from
React state. Concretely, that meant the model **could not see**:

- Campaigns / Marketing Missions and their creative briefs
- The decision engine's channel ranking (`rankChannels`)
- Recommendation → outcome scores — *what actually worked* (`recommendation_scores`)
- Dismissed recommendations — the *rejection* signal
- The versioned business-profile history (`business_profiles`)
- Real Search Console snapshots (`outcome_snapshots`)

It had the profile and the live feed, dumped **flat**, with a "be specific" instruction.
An LLM given a flat context and a generic persona produces generic output. It wasn't a
tone problem; the model was **stateless with respect to the business's own history**, so
it fell back to what it knows — general marketing. That is the ChatGPT smell.

## 2. New reasoning architecture

The pipeline is split so the **LLM is the last and smallest step**:

```
question
  ↓
[deterministic] assembleCmoContext(sql, wsKey, profile)   ← SQL + decision engine, no LLM
  ↓  business → goals → constraints → past decisions → outcomes → channels → mission
[deterministic] confidenceOf(signals)                     ← rich | thin | cold
  ↓
[deterministic] buildCmoPrompt(ctx, question, mode)       ← decide-first scaffold + rules
  ↓
[LLM] /api/generate                                       ← render only; provider fallback + cache
  ↓
answer
```

Everything above the LLM line is `lib/services/cmo-context.ts` — pure/SQL, cacheable,
testable, cheap. The model never chooses *what's true*; it only renders a decision that
has already been grounded.

## 3–8. The pipeline, question by question

1. **What context is retrieved?** Business profile, up to 5 active missions (+progress),
   decision-engine channel ranking, top measured outcomes, dismissed recs, the latest GSC
   snapshot, recent assets — all scoped to the workspace key.
2. **What is never retrieved?** Other workspaces' data, raw un-scored recommendation
   spam, anything not tied to this business. Cross-workspace isolation is enforced by
   `workspaceKey` (server-derived, unspoofable).
3. **What's always injected?** The `[BUSINESS]` block (name, one-liner, audience,
   positioning, voice, competitors) and the evidence level.
4. **How is the state graph queried?** One batched `Promise.all` of bounded, indexed
   queries; each wrapped so a missing table degrades to empty, never a 500.
5. **How do previous campaigns influence answers?** Active missions + goals are injected
   as `[CURRENT GOALS]`; the model is told to align recommendations to them.
6. **How does Recommendation→Action→Outcome history influence answers?** `[WHAT ACTUALLY
   WORKED]` lists measured association scores + click deltas; `[REJECTED]` lists dismissed
   ideas the model must not re-propose. This is the moat made legible to the model.
7. **When does it refuse / hedge?** `confidenceOf` → `cold` forces: "do NOT fabricate
   outcomes; make one grounded hypothesis and name the data you'd want next." No pretending.
8. **When does it ask a clarifying question?** When the question can't be answered from
   the state — it names what's missing, asks ONE sharp question, then still gives a
   provisional call (a CMO doesn't stall).

## 9. Memory architecture

Three tiers, already event-sourced:
- **Durable business memory** — `business_profiles`, `campaigns`, `recommendation_scores`,
  `outcome_snapshots` (the compounding assets). Assembled fresh each turn.
- **Conversation memory** — last 6 turns, passed through, not persisted as truth.
- **Derived signals** — `ContextSignals` (counts) → confidence tier. Cheap, deterministic.

## 10–11. Deterministic vs LLM

| Deterministic (no LLM) | LLM |
|---|---|
| Context retrieval, channel ranking, outcome scoring, confidence tiering, prompt assembly, refusal policy | Final natural-language rendering of the grounded decision |

If it can be computed, it is computed. The LLM sees a finished briefing and a decision
scaffold, not an open question.

## 12. Caching

The briefing is a pure function of workspace state; `/api/generate` already caches on
`(url + prompt)` hash with a stale-fallback. Because the assembled prompt changes only
when the business's state changes, identical questions against unchanged state are cache
hits. (Future: cache the assembled `CmoContext` per wsKey with short TTL to skip the SQL.)

## 13. Hallucination reduction

- The prompt says the state block is "the only facts you may use."
- No measured outcomes → explicit "do NOT claim anything has been proven."
- No live GSC → "any traffic figure is an estimate — say so."
- Confidence tier scales conviction to evidence.
- Server-side temperature stays low (0.4) with the grounding system prompt.

## Files

- `lib/services/cmo-context.ts` — assembler, confidence, briefing renderer, prompt builder
- `app/api/cmo/ask/route.ts` — deterministic half; returns the decide-first prompt
- `app/app/page.tsx` `sendChat` — calls `/api/cmo/ask`, falls back to the local prompt
- `tests/cmo-context.test.ts` — confidence tiering

## Evaluation metrics (is it becoming a real CMO?)

- **Grounding rate** — % of answers that cite a specific mission/outcome/metric from the
  state (target: high on `rich`, honest hedge on `cold`).
- **Decision-first rate** — % of answers whose first sentence is a recommendation, not
  background.
- **Fabrication rate** — % of answers stating a metric/outcome not in the state (target: 0).
- **Rejection respect** — % of answers that avoid re-proposing dismissed ideas.
- **Confidence calibration** — hedging correlates with the `cold/thin/rich` tier.
- **Cost** — LLM calls per answer stays at 1; assembly adds no model spend.

## Not yet wired (pluggable later)

Brand DNA embeddings, Pattern Library, Creative Memory retrieval — the assembler is the
seam where each plugs in as another deterministic `[SECTION]` in the briefing.
