"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { CREATIVE_CATEGORIES, CATEGORY_META } from "@/lib/creative/taxonomy";

// Creative Studio navigation. Reads the category taxonomy so nav and content
// never drift. Renders as a sidebar on desktop and a horizontal scroller on mobile.
export default function StudioNav() {
  const path = usePathname();
  return (
    <nav className="st-nav" aria-label="Creative Studio sections">
      <Link href="/studio" className="st-brand">
        <span className="st-brand-dot" aria-hidden="true" />
        Creative Studio
      </Link>
      <div className="st-links">
        {CREATIVE_CATEGORIES.map((c) => {
          const href = `/studio/${c}`;
          const active = path === href;
          const m = CATEGORY_META[c];
          return (
            <Link key={c} href={href} className={"st-link" + (active ? " on" : "")} aria-current={active ? "page" : undefined}>
              <span className="st-link-ic" aria-hidden="true">{m.icon}</span>
              <span>{m.label}</span>
            </Link>
          );
        })}
      </div>
      <Link href="/app" className="st-back">← Back to app</Link>
    </nav>
  );
}
