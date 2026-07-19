import type { LaunchStage } from "@/lib/creative/types";
import type { LaunchCampaign, TimelineItem, TimelineWeek } from "@/lib/launch/types";

// Campaign Timeline — lays every planned asset across the launch weeks by its stage, so
// a launch reads as "Week 1: Landing Page, Hero Video, Blog … Week 4: Case Study,
// Performance Review". Pure + deterministic.

export function weekCountFor(timelineDays: number): number {
  return Math.max(1, Math.ceil(timelineDays / 7));
}

/** Which week a given launch stage lands in (spread foundation→conversion across the run). */
export function weekForStage(stage: LaunchStage, weekCount: number): number {
  const clamp = (n: number) => Math.min(weekCount, Math.max(1, n));
  switch (stage) {
    case "foundation": return 1;
    case "distribution": return clamp(Math.ceil(weekCount * 0.4));
    case "amplification": return clamp(Math.ceil(weekCount * 0.65));
    case "conversion": return weekCount;
  }
}

function phaseForWeek(week: number, weekCount: number): LaunchStage {
  if (week <= 1) return "foundation";
  if (week >= weekCount) return "conversion";
  return week <= Math.ceil(weekCount * 0.6) ? "distribution" : "amplification";
}

export function assetKey(campaignId: string, kind: string): string {
  return `${campaignId}:${kind}`;
}

/** Build the week-by-week timeline for all campaigns' asset plans. */
export function buildTimeline(campaigns: LaunchCampaign[], timelineDays: number): TimelineWeek[] {
  const weekCount = weekCountFor(timelineDays);
  const weeks: TimelineWeek[] = Array.from({ length: weekCount }, (_, i) => ({
    week: i + 1,
    label: `Week ${i + 1}`,
    phase: phaseForWeek(i + 1, weekCount),
    items: [] as TimelineItem[],
  }));

  for (const c of campaigns) {
    for (const a of c.assetPlan.assets) {
      const w = weekForStage(a.stage, weekCount);
      weeks[w - 1].items.push({
        campaignId: c.id, assetKey: assetKey(c.id, a.kind), kind: a.kind,
        label: a.label, channel: a.channel, stage: a.stage, quantity: a.quantity,
      });
    }
  }

  // Deterministic ordering within a week: by stage order then kind.
  const stageRank: Record<LaunchStage, number> = { foundation: 0, distribution: 1, amplification: 2, conversion: 3 };
  for (const w of weeks) {
    w.items.sort((a, b) => stageRank[a.stage] - stageRank[b.stage] || a.kind.localeCompare(b.kind));
  }
  return weeks;
}
