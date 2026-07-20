"use client";

// The animated progress indicator — a smooth, shimmering bar (no spinner). Width eases
// via CSS transition; a moving sheen conveys ongoing work even between stage changes.
export default function AIProgress({ percent, done }: { percent: number; done?: boolean }) {
  return (
    <div className="aip-bar" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
      <div className={"aip-bar-fill" + (done ? " aip-bar-done" : "")} style={{ width: `${percent}%` }}>
        {!done && <span className="aip-bar-sheen" aria-hidden="true" />}
      </div>
    </div>
  );
}
