import type { Metadata } from "next";
import StudioNav from "./StudioNav";

export const metadata: Metadata = {
  title: "Creative Studio — Populr",
  description: "Plan, generate and approve complete product launches — videos, UGC, motion, and more.",
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="studio">
      <StudioNav />
      <main className="st-main">{children}</main>
    </div>
  );
}
