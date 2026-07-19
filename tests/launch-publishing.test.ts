import { describe, it, expect } from "vitest";
import { PublishingQueue, PUBLISH_STAGES, nextStage, prevStage } from "@/lib/launch/publishing";

const slots = [
  { assetKey: "a", kind: "blog" as const, channel: "articles", week: 1, dayOffset: 1, stage: "draft" as const },
  { assetKey: "b", kind: "email" as const, channel: "email", week: 2, dayOffset: 8, stage: "draft" as const },
];

describe("publishing state machine", () => {
  it("advances draft → creative_review → approval → scheduled → publishing → published", () => {
    const q = new PublishingQueue().load(slots);
    const seq = ["creative_review", "approval", "scheduled", "publishing", "published"];
    for (const expected of seq) {
      const r = q.advance("a");
      expect(r.ok).toBe(true);
      expect(r.item.stage).toBe(expected);
    }
  });

  it("stops at the terminal stage", () => {
    const q = new PublishingQueue(); q.add("a", "archived");
    expect(q.advance("a").error).toBe("terminal_stage");
    expect(nextStage("archived")).toBeNull();
    expect(prevStage("draft")).toBeNull();
  });

  it("fails the publish step and supports retry", () => {
    const q = new PublishingQueue(); q.add("a", "scheduled");
    const fail = q.advance("a", { shouldFail: true });
    expect(fail.ok).toBe(false);
    expect(fail.item.failed).toBe(true);
    expect(fail.item.attempts).toBe(1);
    const retry = q.retry("a", { shouldFail: false });
    expect(retry.ok).toBe(true);
    expect(retry.item.stage).toBe("publishing");
    expect(retry.item.attempts).toBe(2);
  });

  it("rolls back one stage", () => {
    const q = new PublishingQueue(); q.add("a", "published");
    const r = q.rollback("a");
    expect(r.ok).toBe(true);
    expect(r.item.stage).toBe("publishing");
  });

  it("bulk-advances many items", () => {
    const q = new PublishingQueue().load(slots);
    const res = q.bulkAdvance(["a", "b"]);
    expect(res.every((r) => r.ok)).toBe(true);
    expect(q.get("a")!.stage).toBe("creative_review");
    expect(q.get("b")!.stage).toBe("creative_review");
  });

  it("advanceAll moves every non-terminal item forward and summarizes", () => {
    const q = new PublishingQueue().load(slots);
    q.advanceAll();
    const s = q.summary();
    expect(s.creative_review).toBe(2);
    expect(PUBLISH_STAGES.length).toBe(8);
  });

  it("records transition history", () => {
    const q = new PublishingQueue(); q.add("a", "draft");
    q.advance("a"); q.advance("a");
    expect(q.get("a")!.history.length).toBeGreaterThanOrEqual(3);
  });
});
