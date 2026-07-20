"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import AIProcessing, { type AIProcessingProps } from "./AIProcessing";

// Fullscreen version of the AI processing experience. Dims the app and centers the
// processing card. Use for blocking, high-effort work (launch planning, video); use the
// inline <AIProcessing> for chat and lightweight requests.
//
// Rendered through a portal to <body> so its position:fixed centering is always relative
// to the viewport, never a transformed ancestor (e.g. an animated section).
export default function LoadingOverlay(props: AIProcessingProps & { open: boolean; onCancel?: () => void }) {
  const { open, onCancel, ...rest } = props;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open || !mounted) return null;
  return createPortal(
    <div className="aip-overlay" role="dialog" aria-modal="true" aria-label="Populr is working">
      <div className="aip-overlay-card">
        <AIProcessing {...rest} variant="overlay" />
      </div>
    </div>,
    document.body,
  );
}
