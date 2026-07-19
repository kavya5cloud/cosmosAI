import { CATEGORY_META, kindsForCategory, type CreativeCategory } from "@/lib/creative/taxonomy";

// Production-ready section scaffold shared by every studio page. Renders the
// category header plus placeholder cards for each asset kind in that category.
// Generation is intentionally not wired yet — this is the navigation foundation.
export default function StudioSection({ category }: { category: CreativeCategory }) {
  const meta = CATEGORY_META[category];
  const kinds = kindsForCategory(category);
  return (
    <section className="st-section">
      <header className="st-shead">
        <span className="label">{meta.icon} {meta.label}</span>
        <h1>{meta.label}</h1>
        <p>{meta.blurb}</p>
      </header>

      {kinds.length === 0 ? (
        <div className="st-empty">
          <p>This space is being prepared. Assets you generate will appear here.</p>
        </div>
      ) : (
        <div className="st-grid">
          {kinds.map((k) => (
            <article key={k.kind} className="st-card" aria-disabled="true">
              <div className="st-card-top">
                <span className="st-card-kind">{k.label}</span>
                <span className="st-soon">Soon</span>
              </div>
              <p className="st-card-meta">{k.channel} · effort {k.effort}/5{k.foundational ? " · foundational" : ""}</p>
              <button className="st-card-cta" disabled>Generate</button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
