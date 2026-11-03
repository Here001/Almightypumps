/**
 * Numbers for the admin Insights page: which sections people use, and what they do.
 * Day boundaries use Lagos time.
 */
import { sql } from "drizzle-orm";
import type { Db } from "./db";

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);

async function rows(db: Db, q: ReturnType<typeof sql>): Promise<Row[]> {
  const res = (await db.execute(q)) as unknown as { rows: Row[] };
  return res.rows;
}

export type Insights = Awaited<ReturnType<typeof getInsights>>;

export async function getInsights(db: Db, days: number) {
  const since = sql`now() - make_interval(days => ${days})`;
  const [traffic, sections, daily, signups, topups, growth, growthApi, trades, listings, withdrawals, topServices] = await Promise.all([
    rows(db, sql`SELECT count(*) AS views, count(DISTINCT visitor) AS visitors FROM site_events WHERE at > ${since}`),
    rows(db, sql`SELECT section, count(*) AS views, count(DISTINCT visitor) AS visitors FROM site_events WHERE at > ${since} GROUP BY section ORDER BY views DESC`),
    rows(db, sql`SELECT to_char((at AT TIME ZONE 'Africa/Lagos')::date, 'YYYY-MM-DD') AS day, count(*) AS views, count(DISTINCT visitor) AS visitors
                 FROM site_events WHERE at > ${since} GROUP BY 1 ORDER BY 1`),
    rows(db, sql`SELECT count(*) AS n FROM users WHERE NOT is_system AND created_at > ${since}`),
    rows(db, sql`SELECT count(*) AS n, coalesce(sum(amount), 0) AS total FROM payments WHERE status = 'success' AND paid_at > ${since}`),
    rows(db, sql`SELECT count(*) AS n, coalesce(sum(o.charged), 0) AS charged,
                        coalesce(sum(o.charged * p.markup_bps / (10000 + p.markup_bps)), 0) AS markup
                 FROM smm_orders o JOIN smm_services s ON s.id = o.service_id JOIN smm_providers p ON p.id = s.provider_id
                 WHERE o.created_at > ${since}`),
    rows(db, sql`SELECT count(*) AS n FROM smm_orders WHERE api_key_id IS NOT NULL AND created_at > ${since}`),
    rows(db, sql`SELECT count(*) AS n, coalesce(sum(amount) FILTER (WHERE status = 'COMPLETED'), 0) AS volume,
                        coalesce(sum(fee) FILTER (WHERE status = 'COMPLETED'), 0) AS fees
                 FROM trades WHERE created_at > ${since}`),
    rows(db, sql`SELECT count(*) AS n FROM listings WHERE created_at > ${since}`),
    rows(db, sql`SELECT count(*) AS n FROM withdrawals WHERE created_at > ${since}`),
    rows(db, sql`SELECT s.name, s.category, count(*) AS orders, coalesce(sum(o.charged), 0) AS charged
                 FROM smm_orders o JOIN smm_services s ON s.id = o.service_id
                 WHERE o.created_at > ${since} GROUP BY s.id, s.name, s.category ORDER BY orders DESC LIMIT 5`),
  ]);

  // Fill in days with no visits so the daily chart has no gaps.
  const byDay = new Map(daily.map((d) => [String(d.day), d]));
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" });
  const series: { day: string; views: number; visitors: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = fmt.format(new Date(Date.now() - i * 86_400_000));
    const d = byDay.get(day);
    series.push({ day, views: num(d?.views), visitors: num(d?.visitors) });
  }

  const growthAll = num(growth[0]?.n);
  const growthViaApi = num(growthApi[0]?.n);
  return {
    days,
    views: num(traffic[0]?.views),
    visitors: num(traffic[0]?.visitors),
    sections: sections.map((s) => ({ section: String(s.section), views: num(s.views), visitors: num(s.visitors) })),
    daily: series,
    signups: num(signups[0]?.n),
    topups: { count: num(topups[0]?.n), total: num(topups[0]?.total) },
    growth: { count: growthAll, charged: num(growth[0]?.charged), markup: num(growth[0]?.markup) },
    trades: { count: num(trades[0]?.n), volume: num(trades[0]?.volume), fees: num(trades[0]?.fees) },
    actions: [
      { label: "Sign-ups", count: num(signups[0]?.n) },
      { label: "Wallet top-ups", count: num(topups[0]?.n) },
      { label: "Growth orders (website)", count: growthAll - growthViaApi },
      { label: "Growth orders (reseller API)", count: growthViaApi },
      { label: "P2P trades started", count: num(trades[0]?.n) },
      { label: "Marketplace ads posted", count: num(listings[0]?.n) },
      { label: "Withdrawal requests", count: num(withdrawals[0]?.n) },
    ].sort((a, b) => b.count - a.count),
    topServices: topServices.map((s) => ({ name: String(s.name), category: String(s.category), orders: num(s.orders), charged: num(s.charged) })),
  };
}
