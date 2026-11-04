import Link from "next/link";
import { getDb } from "@/server/db";
import { adminOrRedirect } from "@/server/adminPage";
import { getInsights } from "@/server/insights";
import { naira } from "@/components/api";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90];
const n = (v: number) => v.toLocaleString("en-NG");
/** Whole naira for the headline tiles, e.g. ₦30,000 */
const nairaWhole = (kobo: number) => "₦" + Math.round(kobo / 100).toLocaleString("en-NG");

function shortDay(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Horizontal bars, one hue, value printed as text beside each bar. */
function BarList({ items, unit, empty }: { items: { label: string; value: number; note?: string }[]; unit: string; empty: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.every((i) => i.value === 0)) return <div className="empty">{empty}</div>;
  return (
    <ul className="barlist">
      {items.map((i) => (
        <li key={i.label} title={`${i.label}: ${n(i.value)} ${unit}${i.note ? ` · ${i.note}` : ""}`}>
          <div className="barlist-head"><span>{i.label}</span><span className="barlist-val">{n(i.value)}{i.note ? <span className="muted"> · {i.note}</span> : null}</span></div>
          <div className="barlist-track"><div className="barlist-bar" style={{ width: `${Math.max(i.value > 0 ? 2 : 0, (i.value / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await adminOrRedirect();
  const { days: raw } = await searchParams;
  const days = RANGES.includes(Number(raw)) ? Number(raw) : 30;
  const d = await getInsights(getDb(), days);
  const maxDay = Math.max(1, ...d.daily.map((x) => x.visitors));
  const labelEvery = days <= 7 ? 1 : days <= 30 ? 5 : 15;

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28 }}>Visitors & sales</h1>
          <p className="muted">What people visit and do on Almighty Pumps. Anonymous: no names, IPs or devices are stored.</p>
        </div>
        <nav className="seg" aria-label="Time range">
          {RANGES.map((r) => (
            <Link key={r} href={`/admin/insights?days=${r}`} aria-current={r === days ? "true" : undefined}>{r} days</Link>
          ))}
        </nav>
      </div>

      <div className="tiles">
        <div className="tile glass"><div className="tile-label">Visitors</div><div className="tile-num">{n(d.visitors)}</div><div className="muted tile-sub">{n(d.views)} page views</div></div>
        <div className="tile glass"><div className="tile-label">New sign-ups</div><div className="tile-num">{n(d.signups)}</div></div>
        <div className="tile glass"><div className="tile-label">Wallet top-ups</div><div className="tile-num">{nairaWhole(d.topups.total)}</div><div className="muted tile-sub">{n(d.topups.count)} payments</div></div>
        <div className="tile glass"><div className="tile-label">Growth sales</div><div className="tile-num">{nairaWhole(d.growth.charged)}</div><div className="muted tile-sub">≈ {naira(d.growth.markup)} your markup</div></div>
        <div className="tile glass"><div className="tile-label">P2P completed</div><div className="tile-num">{nairaWhole(d.trades.volume)}</div><div className="muted tile-sub">{naira(d.trades.fees)} in fees</div></div>
      </div>

      <div className="grid-cards">
        <section className="card glass">
          <h2>Most used sections</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>Visits per section, most popular first</p>
          <BarList
            unit="visits"
            empty="No visits recorded yet. Views start counting from this update."
            items={d.sections.map((s) => ({ label: s.section, value: s.views, note: `${n(s.visitors)} people` }))}
          />
        </section>
        <section className="card glass">
          <h2>What people do</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>Actions completed in the last {days} days</p>
          <BarList unit="times" empty="Nothing yet in this period." items={d.actions.map((a) => ({ label: a.label, value: a.count }))} />
        </section>
      </div>

      <section className="card glass">
        <h2>Visitors per day</h2>
        <div className="cols" role="img" aria-label={`Visitors per day over the last ${days} days. Peak ${n(maxDay)}.`}>
          <div className="cols-grid"><span>{n(maxDay)}</span><span>0</span></div>
          <div className="cols-bars">
            {d.daily.map((x, i) => (
              <div key={x.day} className="col" tabIndex={0}>
                <div className="col-bar" style={{ height: `${(x.visitors / maxDay) * 100}%` }} />
                <div className="col-tip" role="tooltip">{shortDay(x.day)}<br /><b>{n(x.visitors)}</b> visitors · {n(x.views)} views</div>
                {(i % labelEvery === 0 || i === d.daily.length - 1) && (
                  <div className={`col-label${i === 0 || i === d.daily.length - 1 ? "" : " mid"}`}>{shortDay(x.day)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
        <details>
          <summary className="muted" style={{ fontSize: 13, cursor: "pointer" }}>Show as table</summary>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Day</th><th>Visitors</th><th>Page views</th></tr></thead>
            <tbody>{[...d.daily].reverse().map((x) => <tr key={x.day}><td>{shortDay(x.day)}</td><td>{n(x.visitors)}</td><td>{n(x.views)}</td></tr>)}</tbody>
          </table></div>
        </details>
      </section>

      <section className="card glass">
        <h2>Top growth services</h2>
        {d.topServices.length === 0 ? <div className="empty">No growth orders in this period.</div> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Service</th><th>Category</th><th>Orders</th><th>Sales</th></tr></thead>
            <tbody>{d.topServices.map((s) => <tr key={s.name}><td>{s.name}</td><td>{s.category}</td><td>{n(s.orders)}</td><td>{naira(s.charged)}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
