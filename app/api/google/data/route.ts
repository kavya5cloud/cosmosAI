import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAccessToken, queryAnalytics, isoDaysAgo } from "@/lib/google";

export const runtime = "nodejs";

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n));
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  const sql = db();
  if (!session || !sql) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const site = req.nextUrl.searchParams.get("site");
  const range = req.nextUrl.searchParams.get("range") === "30d" ? 30 : 7;
  if (!site) return NextResponse.json({ error: "no_site" }, { status: 400 });

  try {
    const token = await getAccessToken(sql, session.userId);
    if (!token) return NextResponse.json({ error: "not_connected" }, { status: 403 });

    const start = isoDaysAgo(range + 2); // GSC data lags ~2 days
    const end = isoDaysAgo(2);

    const [totals, byDate, byQuery] = await Promise.all([
      queryAnalytics(token, site, start, end, []),
      queryAnalytics(token, site, start, end, ["date"]),
      queryAnalytics(token, site, start, end, ["query"]),
    ]);

    const t = totals[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    const series = {
      labels: byDate.map((r) => (r.keys?.[0] || "").slice(5)),
      impressions: byDate.map((r) => r.impressions),
      clicks: byDate.map((r) => r.clicks),
    };
    const queries = byQuery.slice(0, 6).map((r) => ({
      pos: "#" + Math.round(r.position),
      query: r.keys?.[0] || "",
      trend: (r.clicks || 0) + " clk",
    }));

    return NextResponse.json({
      site,
      impressions: fmt(t.impressions),
      clicks: fmt(t.clicks),
      ctr: (t.ctr * 100).toFixed(1) + "%",
      position: t.position.toFixed(1),
      series,
      queries,
    });
  } catch (e) {
    return NextResponse.json({ error: "fetch_failed", detail: String(e).slice(0, 150) }, { status: 502 });
  }
}
