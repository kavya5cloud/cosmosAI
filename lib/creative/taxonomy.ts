// Creative taxonomy — the SINGLE source of truth for what Populr's Creative Studio
// can produce. The Studio navigation, the Asset Planner, the Creative Director and
// the Approval Council all read from here so categories/kinds never drift apart.
//
// This is deliberately UI-free and dependency-free (pure data) so it can be imported
// by server services, API routes and client components alike.

/** Top-level Creative Studio sections (also the /studio nav). */
export const CREATIVE_CATEGORIES = [
  "launch",
  "videos",
  "ugc",
  "motion",
  "images",
  "documents",
  "ads",
  "library",
] as const;
export type CreativeCategory = (typeof CREATIVE_CATEGORIES)[number];

/** A concrete deliverable the planner can schedule and the studio can (later) generate. */
export const ASSET_KINDS = [
  "hero_video",
  "product_demo",
  "ugc_video",
  "motion_graphic",
  "landing_hero",
  "linkedin_post",
  "x_thread",
  "reddit_post",
  "email",
  "carousel",
  "instagram_post",
  "blog",
  "infographic",
  "advertisement",
  "press_release",
  "sales_deck",
  "case_study",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Where an asset kind is produced/distributed. Maps to the ranking channel vocabulary. */
export type CreativeChannel =
  | "video" | "landing" | "linkedin" | "x" | "reddit" | "email"
  | "instagram" | "articles" | "ads" | "docs";

export type AssetKindMeta = {
  kind: AssetKind;
  label: string;
  category: CreativeCategory;
  channel: CreativeChannel;
  /** Rough relative production effort (1 cheap … 5 heavy) — used by the planner's ordering. */
  effort: number;
  /** Whether this kind is a foundational/hero asset others are derived from. */
  foundational: boolean;
  /** Optional bridge to the existing Asset Graph type vocabulary (lib/services/asset-validate). */
  graphType?: string;
};

// Ordered roughly by production dependency: foundational/hero assets first, then
// distribution and repurposed assets. The planner relies on this ordering.
export const ASSET_KIND_META: Record<AssetKind, AssetKindMeta> = {
  hero_video:      { kind: "hero_video",      label: "Hero Launch Video", category: "videos",    channel: "video",     effort: 5, foundational: true },
  product_demo:    { kind: "product_demo",    label: "Product Demo",      category: "videos",    channel: "video",     effort: 4, foundational: true },
  ugc_video:       { kind: "ugc_video",       label: "UGC Video",         category: "ugc",       channel: "video",     effort: 3, foundational: false },
  motion_graphic:  { kind: "motion_graphic",  label: "Motion Graphic",    category: "motion",    channel: "video",     effort: 3, foundational: false },
  landing_hero:    { kind: "landing_hero",    label: "Landing Hero",      category: "images",    channel: "landing",   effort: 3, foundational: true,  graphType: "landing_copy" },
  linkedin_post:   { kind: "linkedin_post",   label: "LinkedIn Post",     category: "documents", channel: "linkedin",  effort: 1, foundational: false, graphType: "linkedin_post" },
  x_thread:        { kind: "x_thread",        label: "X Thread",          category: "documents", channel: "x",         effort: 1, foundational: false, graphType: "x_thread" },
  reddit_post:     { kind: "reddit_post",     label: "Reddit Post",       category: "documents", channel: "reddit",    effort: 1, foundational: false, graphType: "reddit_post" },
  email:           { kind: "email",           label: "Email",             category: "documents", channel: "email",     effort: 1, foundational: false, graphType: "email" },
  carousel:        { kind: "carousel",        label: "Carousel",          category: "images",    channel: "instagram", effort: 2, foundational: false, graphType: "ig_carousel" },
  instagram_post:  { kind: "instagram_post",  label: "Instagram Post",    category: "images",    channel: "instagram", effort: 1, foundational: false },
  blog:            { kind: "blog",            label: "Blog / Article",    category: "documents", channel: "articles",  effort: 2, foundational: true,  graphType: "blog" },
  infographic:     { kind: "infographic",     label: "Infographic",       category: "images",    channel: "instagram", effort: 2, foundational: false },
  advertisement:   { kind: "advertisement",   label: "Advertisement",     category: "ads",       channel: "ads",       effort: 2, foundational: false },
  press_release:   { kind: "press_release",   label: "Press Release",     category: "documents", channel: "articles",  effort: 2, foundational: false },
  sales_deck:      { kind: "sales_deck",      label: "Sales Deck",        category: "documents", channel: "docs",      effort: 3, foundational: false },
  case_study:      { kind: "case_study",      label: "Case Study",        category: "documents", channel: "articles",  effort: 2, foundational: false },
};

export const CATEGORY_META: Record<CreativeCategory, { label: string; blurb: string }> = {
  launch:    { label: "Launch",         blurb: "Complete, multi-asset product launches planned end-to-end." },
  videos:    { label: "Videos",         blurb: "Hero launch videos and product demos." },
  ugc:       { label: "UGC",            blurb: "Authentic creator-style user-generated videos." },
  motion:    { label: "Motion Graphics", blurb: "Animated explainers, loops and kinetic type." },
  images:    { label: "Images",         blurb: "Landing heroes, carousels, infographics and posts." },
  documents: { label: "Documents",      blurb: "Blogs, threads, emails, press releases and decks." },
  ads:       { label: "Ads",            blurb: "Performance ad creatives across paid channels." },
  library:   { label: "Asset Library",  blurb: "Every generated asset, versioned and searchable." },
};

export function kindsForCategory(category: CreativeCategory): AssetKindMeta[] {
  return ASSET_KINDS.map((k) => ASSET_KIND_META[k]).filter((m) => m.category === category);
}
