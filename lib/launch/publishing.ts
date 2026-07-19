import type { PublishSlot, PublishStage } from "@/lib/launch/types";

// Publishing Pipeline — the orchestration of an asset from Draft to Archived. A pure,
// deterministic state machine (no vendor, no side effects) with retry, rollback and
// bulk operations. It mirrors the Asset Graph lifecycle events; when wired to the DB the
// same transitions append asset_events.

export const PUBLISH_STAGES: PublishStage[] = [
  "draft", "creative_review", "approval", "scheduled",
  "publishing", "published", "measured", "archived",
];

const NEXT: Record<PublishStage, PublishStage | null> = {
  draft: "creative_review",
  creative_review: "approval",
  approval: "scheduled",
  scheduled: "publishing",
  publishing: "published",
  published: "measured",
  measured: "archived",
  archived: null,
};

export function nextStage(stage: PublishStage): PublishStage | null {
  return NEXT[stage];
}
export function prevStage(stage: PublishStage): PublishStage | null {
  const i = PUBLISH_STAGES.indexOf(stage);
  return i > 0 ? PUBLISH_STAGES[i - 1] : null;
}

export type PublishItem = {
  assetKey: string;
  stage: PublishStage;
  attempts: number;
  failed: boolean;
  lastError?: string;
  history: { stage: PublishStage; at: number; note?: string }[];
};

export type AdvanceResult = { ok: boolean; item: PublishItem; error?: string };

/**
 * Publishing queue — holds items and advances them through the pipeline. Deterministic:
 * transitions are pure; the only clock is an injectable `now` for stable tests.
 */
export class PublishingQueue {
  private items = new Map<string, PublishItem>();
  private now: () => number;

  constructor(opts: { now?: () => number } = {}) {
    this.now = opts.now ?? (() => 0);
  }

  /** Seed the queue from a plan's publishing schedule (all start in Draft). */
  load(slots: PublishSlot[]): this {
    for (const s of slots) this.add(s.assetKey, s.stage);
    return this;
  }

  add(assetKey: string, stage: PublishStage = "draft"): PublishItem {
    const item: PublishItem = { assetKey, stage, attempts: 0, failed: false, history: [{ stage, at: this.now() }] };
    this.items.set(assetKey, item);
    return item;
  }

  get(assetKey: string): PublishItem | undefined {
    return this.items.get(assetKey);
  }
  all(): PublishItem[] {
    return [...this.items.values()];
  }

  /** Advance one item to the next stage. The publishing step can fail (simulated via shouldFail). */
  advance(assetKey: string, opts: { shouldFail?: boolean; note?: string } = {}): AdvanceResult {
    const item = this.items.get(assetKey);
    if (!item) return { ok: false, item: this.add(assetKey), error: "not_found" };
    const target = NEXT[item.stage];
    if (!target) return { ok: false, item, error: "terminal_stage" };

    // The publishing → published step is the one that can fail and needs retries.
    if (item.stage === "scheduled" && target === "publishing") {
      item.attempts += 1;
    }
    if (opts.shouldFail && target === "publishing") {
      item.failed = true;
      item.lastError = "publish_failed";
      item.history.push({ stage: item.stage, at: this.now(), note: "publish attempt failed" });
      return { ok: false, item, error: "publish_failed" };
    }

    item.failed = false;
    item.lastError = undefined;
    item.stage = target;
    item.history.push({ stage: target, at: this.now(), note: opts.note });
    return { ok: true, item };
  }

  /** Retry a failed item — re-attempts the publishing transition. */
  retry(assetKey: string, opts: { shouldFail?: boolean } = {}): AdvanceResult {
    const item = this.items.get(assetKey);
    if (!item) return { ok: false, item: this.add(assetKey), error: "not_found" };
    if (!item.failed) return { ok: false, item, error: "not_failed" };
    return this.advance(assetKey, { shouldFail: opts.shouldFail, note: "retry" });
  }

  /** Roll an item back one stage (e.g. a published asset pulled for a fix). */
  rollback(assetKey: string, opts: { note?: string } = {}): AdvanceResult {
    const item = this.items.get(assetKey);
    if (!item) return { ok: false, item: this.add(assetKey), error: "not_found" };
    const target = prevStage(item.stage);
    if (!target) return { ok: false, item, error: "at_start" };
    item.stage = target;
    item.failed = false;
    item.history.push({ stage: target, at: this.now(), note: opts.note ?? "rollback" });
    return { ok: true, item };
  }

  /** Advance many items at once (bulk publishing). Returns per-item results. */
  bulkAdvance(assetKeys: string[], opts: { shouldFail?: (key: string) => boolean } = {}): AdvanceResult[] {
    return assetKeys.map((k) => this.advance(k, { shouldFail: opts.shouldFail?.(k) }));
  }

  /** Advance every non-terminal, non-failed item one step. */
  advanceAll(): AdvanceResult[] {
    return this.all()
      .filter((i) => NEXT[i.stage] && !i.failed)
      .map((i) => this.advance(i.assetKey));
  }

  /** Count of items in each stage (for the dashboard). */
  summary(): Record<PublishStage, number> {
    const out = Object.fromEntries(PUBLISH_STAGES.map((s) => [s, 0])) as Record<PublishStage, number>;
    for (const i of this.all()) out[i.stage] += 1;
    return out;
  }
}
