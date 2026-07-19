import type { AssetKind } from "@/lib/creative/taxonomy";
import type { CreativeSubject, EvaluationContext, EvaluatorResult } from "@/lib/creative/types";
import { result, subjectText, words } from "./util";

// Platform Suitability — is the asset the right SHAPE for its channel? Deterministic
// length windows per kind (word counts), plus a couple of format checks.
type Window = { min: number; ideal: [number, number]; max: number };

const LENGTH: Partial<Record<AssetKind, Window>> = {
  x_thread:       { min: 30,  ideal: [60, 260],  max: 500 },
  linkedin_post:  { min: 40,  ideal: [80, 220],  max: 400 },
  reddit_post:    { min: 40,  ideal: [80, 300],  max: 700 },
  email:          { min: 40,  ideal: [90, 260],  max: 500 },
  blog:           { min: 250, ideal: [500, 1500], max: 4000 },
  landing_hero:   { min: 15,  ideal: [25, 90],   max: 160 },
  carousel:       { min: 20,  ideal: [40, 140],  max: 260 },
  instagram_post: { min: 8,   ideal: [15, 80],   max: 220 },
  press_release:  { min: 150, ideal: [300, 700], max: 1200 },
  case_study:     { min: 200, ideal: [400, 1200], max: 3000 },
  sales_deck:     { min: 60,  ideal: [120, 500], max: 1500 },
  advertisement:  { min: 5,   ideal: [12, 40],   max: 90 },
  hero_video:     { min: 20,  ideal: [40, 180],  max: 400 }, // treated as the script
  product_demo:   { min: 20,  ideal: [40, 220],  max: 500 },
  ugc_video:      { min: 10,  ideal: [25, 120],  max: 250 },
  motion_graphic: { min: 5,   ideal: [10, 60],   max: 150 },
  infographic:    { min: 10,  ideal: [20, 90],   max: 200 },
};

export function platformSuitability(subject: CreativeSubject, _ctx: EvaluationContext): EvaluatorResult {
  const wc = words(subjectText(subject)).length;
  const win = LENGTH[subject.kind];

  if (!win) {
    return result("platform_suitability", 0.6, 0.3, `No length profile for ${subject.kind}; length ${wc} words.`, [
      "No platform length profile — reviewed on content only.",
    ]);
  }

  const [lo, hi] = win.ideal;
  let score: number;
  const recs: string[] = [];
  if (wc >= lo && wc <= hi) {
    score = 1;
  } else if (wc < win.min) {
    score = 0.3 + 0.4 * (wc / Math.max(1, win.min));
    recs.push(`Too short for ${subject.kind} (${wc} words) — aim for ${lo}–${hi}.`);
  } else if (wc > win.max) {
    score = 0.3;
    recs.push(`Too long for ${subject.kind} (${wc} words) — trim toward ${lo}–${hi}.`);
  } else {
    // Between min/ideal or ideal/max — partial credit scaled by distance to the ideal band.
    const dist = wc < lo ? (lo - wc) / Math.max(1, lo - win.min) : (wc - hi) / Math.max(1, win.max - hi);
    score = 1 - 0.5 * Math.min(1, dist);
    recs.push(`Near the edge of the ideal length for ${subject.kind} (${wc} words; ideal ${lo}–${hi}).`);
  }
  if (!recs.length) recs.push(`Well-sized for ${subject.kind}.`);

  return result("platform_suitability", score, 0.85, `Length ${wc} words vs ideal ${lo}–${hi} for ${subject.kind}.`, recs);
}
