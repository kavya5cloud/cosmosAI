import Link from "next/link";
import { CREATIVE_CATEGORIES, CATEGORY_META } from "@/lib/creative/taxonomy";

// Creative Studio overview. Entry point into the section navigation. Generation is
// not wired yet — every launch flows through Mission → Campaign → Brief → Planner →
// Director → Council before any asset is produced.
export default function StudioHome() {
  return (
    <section className="st-section">
      <header className="st-shead">
        <span className="label">🚀 Creative Studio</span>
        <h1>Build complete launches, not just content.</h1>
        <p>
          Plan every asset from a single campaign brief, let the Creative Director score it,
          and route it through the Approval Council — all before a word is generated.
        </p>
      </header>

      <div className="st-grid">
        {CREATIVE_CATEGORIES.map((c) => {
          const m = CATEGORY_META[c];
          return (
            <Link key={c} href={`/studio/${c}`} className="st-card st-card-link">
              <div className="st-card-top">
                <span className="st-card-kind">{m.icon} {m.label}</span>
              </div>
              <p className="st-card-meta">{m.blurb}</p>
              <span className="st-card-cta st-card-open">Open →</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
