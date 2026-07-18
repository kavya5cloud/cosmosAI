import type { CmoContext } from "@/lib/services/cmo-context";
import { ASSET_LABEL, type AssetKind } from "@/lib/services/intent-router";

// Transformation Engine — convert one asset into another format while preserving the
// message and voice (blog → thread → carousel → reel → linkedin → newsletter → …).
// Output is only the transformed asset.

const TARGET_FORMAT: Partial<Record<AssetKind, string>> = {
  x_thread: "a 5–7 tweet thread; tweet 1 is the hook, numbered 1/…, each under 280 chars",
  x_post: "one X post under 280 characters",
  linkedin_post: "a 120–200 word LinkedIn post with a strong opening insight",
  reddit_post: "a helpful, non-promotional Reddit post",
  ig_carousel: "a 5–7 slide carousel; each slide a short title + one line; last slide is the CTA",
  ig_reel_script: "a reel script: hook, 3–5 beats with on-screen text + voiceover, CTA",
  email: "a newsletter email: subject line + 100–180 word body + one CTA",
  blog: "a 400–600 word blog draft with a title and short sections",
};

export function buildTransformPrompt(ctx: CmoContext, target: AssetKind, source: string): string {
  const fmt = TARGET_FORMAT[target] || ASSET_LABEL[target];
  return `You are the content studio for ${ctx.business.name || "this brand"}. Convert the source asset below into ${ASSET_LABEL[target]}.

Voice: ${ctx.business.voice || "match the source voice"}.

Rules:
- Preserve the core message and key points; adapt the structure to the new format: ${fmt}.
- Do NOT invent new facts or statistics not present in the source.
- Output ONLY the ${ASSET_LABEL[target]}. No commentary.

--- SOURCE ASSET ---
${source}
--- END ---`;
}
