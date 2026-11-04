"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, naira } from "./api";

type Tab = "gift" | "airtime" | "travel";
type Msg = { ok: boolean; text: string } | null;
type Stats = { delivered: number; refunded: number; pending: number; revenueKobo: number; costKobo?: number };
type Bal = { amount?: number | null; usd?: number | null; currency?: string | null; error: string | null } | null;
type Row = { id: string; publicId: number; status: string; priceKobo: number; error: string | null; email: string; createdAt: string; [k: string]: unknown };

type GiftData = {
  config: { markupBps: number; enabled: boolean; countries: string[]; syncedAt: string | null }; configured: boolean; mode: string | null; balance: Bal; stats: Stats;
  recent: Row[]; products: { id: number; name: string; brand: string; country: string; hidden: boolean; featured: boolean }[]; totalProducts: number;
};
type AirData = {
  config: { airtimeMarkupBps: number; dataMarkupBps: number; enabled: boolean }; configured: boolean; mode: string | null; balance: Bal; stats: Stats; recent: Row[];
  operators: { id: number; name: string; network: string; data: boolean; type: string; currency: string; plans: number }[];
};
type TravelData = {
  config: { markupBps: number; enabled: boolean; syncedAt: string | null }; configured: boolean; balance: Bal; stats: Stats; recent: Row[]; totalPackages: number; usdRateKobo: number;
  packages: { code: string; name: string; data: string; days: string; countries: number; priceKobo: number; costKobo: number; hidden: boolean }[];
};

const TABS: { id: Tab; label: string }[] = [{ id: "gift", label: "Gift cards" }, { id: "airtime", label: "Airtime & data" }, { id: "travel", label: "Travel eSIMs" }];
const when = (d: string) => new Date(d).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
const STATUS: Record<string, string> = { pending: "Processing", delivered: "Delivered", refunded: "Refunded", failed: "Failed (not charged)" };

export function AdminInstant() {
  const [tab, setTab] = useState<Tab>("gift");
  const [data, setData] = useState<GiftData | AirData | TravelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});

  const seq = useRef(0);
  const load = useCallback(async (t: Tab, search = "") => {
    setError(null);
    const mine = ++seq.current;
    try {
      const d = await api<GiftData | AirData | TravelData>(`/api/admin/instant?tab=${t}&q=${encodeURIComponent(search)}`);
      if (mine !== seq.current) return; // a newer tab/search was opened meanwhile
      setData(d);
      const c = d.config as Record<string, unknown>;
      setForm({
        markup: String(Number(c.markupBps ?? 0) / 100), air: String(Number(c.airtimeMarkupBps ?? 0) / 100), data: String(Number(c.dataMarkupBps ?? 0) / 100),
        countries: Array.isArray(c.countries) ? (c.countries as string[]).join(", ") : "",
      });
    } catch (e) {
      if (mine === seq.current) setError((e as Error).message);
    }
  }, []);
  useEffect(() => { setData(null); setQ(""); setMsg(null); void load(tab); }, [tab, load]);

  async function act(body: Record<string, unknown>, ok: string | ((r: Record<string, unknown>) => string)) {
    setBusy(true); setMsg(null);
    try {
      const r = await api<Record<string, unknown>>("/api/admin/instant", body);
      setMsg({ ok: true, text: typeof ok === "function" ? ok(r) : ok });
      await load(tab, q);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const cfg = data?.config as Record<string, unknown> | undefined;
  const enabled = Boolean(cfg?.enabled);
  const prefix = tab === "gift" ? "gift" : tab === "airtime" ? "airtime" : "travel";

  return (
    <>
      <div className="ap-chips" role="group" aria-label="Product">
        {TABS.map((t) => <button key={t.id} type="button" className="ap-chip" aria-pressed={t.id === tab} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {!data && !error && <p className="muted" role="status">Loading…</p>}
      {data && (
        <>
          <section className="card glass">
            <h2>{TABS.find((t) => t.id === tab)!.label}</h2>
            {!data.configured && <div className="form-error" role="alert">The API keys aren&apos;t set in Vercel for this site, so customers can&apos;t buy this yet.</div>}
            <dl className="ap-facts">
              <dt>Status</dt><dd>{enabled ? "On sale" : "Paused"} {"mode" in data && data.mode ? `· Reloadly ${data.mode === "sandbox" ? "TEST (sandbox) keys" : "LIVE keys"}` : ""}</dd>
              <dt>Provider balance</dt><dd>{data.balance ? data.balance.error ? <span style={{ color: "var(--bad, #f87171)" }}>{data.balance.error}</span> : data.balance.usd != null ? `$${data.balance.usd.toFixed(2)}` : `${data.balance.amount?.toLocaleString("en", { maximumFractionDigits: 2 })} ${data.balance.currency ?? ""}` : "—"}</dd>
              <dt>Sales</dt><dd>{data.stats.delivered} delivered · {naira(data.stats.revenueKobo)}{data.stats.costKobo ? ` (cost ≈ ${naira(data.stats.costKobo)})` : ""} · {data.stats.pending} processing · {data.stats.refunded} refunded</dd>
              {"totalProducts" in data && <><dt>Catalogue</dt><dd>{data.totalProducts.toLocaleString()} gift cards{data.config.syncedAt ? `, updated ${when(data.config.syncedAt)}` : ""}</dd></>}
              {"totalPackages" in data && <><dt>Catalogue</dt><dd>{data.totalPackages.toLocaleString()} packages{data.config.syncedAt ? `, updated ${when(data.config.syncedAt)}` : ""}</dd></>}
            </dl>

            <div className="vc-price-form">
              {tab === "airtime" ? (
                <>
                  <label>Airtime markup % <input className="input" style={{ width: 90 }} inputMode="decimal" value={form.air ?? ""} onChange={set("air")} /></label>
                  <label>Data markup % <input className="input" style={{ width: 90 }} inputMode="decimal" value={form.data ?? ""} onChange={set("data")} /></label>
                  <button type="button" className="btn btn-primary ap-mini" disabled={busy} onClick={() => void act({ action: "airtimeConfig", airtimeMarkupPercent: Number(form.air), dataMarkupPercent: Number(form.data) }, "Markups saved.")}>Save</button>
                </>
              ) : (
                <>
                  <label>Markup % <input className="input" style={{ width: 90 }} inputMode="decimal" value={form.markup ?? ""} onChange={set("markup")} /></label>
                  <button type="button" className="btn btn-primary ap-mini" disabled={busy} onClick={() => void act({ action: `${prefix}Config`, markupPercent: Number(form.markup) }, "Markup saved. Prices update straight away.")}>Save</button>
                </>
              )}
              <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => void act({ action: `${prefix}Config`, enabled: !enabled }, enabled ? "Paused: customers can't buy this now." : "Back on sale.")}>{enabled ? "Pause sales" : "Resume sales"}</button>
            </div>
            {tab === "gift" && (
              <div className="vc-price-form">
                <label style={{ flex: "1 1 260px" }}>Countries (codes) <input className="input" value={form.countries ?? ""} onChange={set("countries")} placeholder="US, GB, CA, NG" /></label>
                <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => void act({ action: "giftConfig", countries: (form.countries ?? "").split(/[,\s]+/).filter(Boolean) }, "Countries saved. Tap “Update catalogue” to load them.")}>Save countries</button>
                <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => void act({ action: "giftSync" }, (r) => `Catalogue updated: ${r.products} gift cards.`)}>{busy ? "Working…" : "Update catalogue"}</button>
              </div>
            )}
            {tab === "airtime" && <button type="button" className="btn btn-ghost ap-mini" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={() => void act({ action: "airtimeRefresh" }, (r) => `Networks refreshed: ${r.operators} found.`)}>Refresh networks</button>}
            {tab === "travel" && <button type="button" className="btn btn-ghost ap-mini" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={() => void act({ action: "travelSync" }, (r) => `Catalogue updated: ${r.packages} packages.`)}>{busy ? "Working…" : "Update catalogue"}</button>}
            {tab === "airtime" && <p className="muted" style={{ fontSize: 13 }}>0% = customers pay face value; you earn Reloadly&apos;s network discount. Prices round up to the next ₦1.</p>}
            {tab === "gift" && <p className="muted" style={{ fontSize: 13 }}>Price = Reloadly&apos;s price × (1 + markup), converted with the site dollar rate when Reloadly charges in dollars, rounded up to ₦10.</p>}
            {tab === "travel" && <p className="muted" style={{ fontSize: 13 }}>Price = eSIM Access price (US$) × site dollar rate × (1 + markup), rounded up to ₦10. 150% markup ≈ 2.5× cost.</p>}
            {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
          </section>

          <section className="card glass">
            <h2>Recent orders</h2>
            {data.recent.length === 0 ? <div className="empty">No orders yet.</div> : (
              <ul className="vc-admin-list">
                {data.recent.map((r) => (
                  <li key={r.id}>
                    <div style={{ minWidth: 0 }}>
                      <strong>{String(r.name ?? r.description ?? r.label)}</strong>{r.value ? ` · ${String(r.value)}` : ""}{r.phone ? ` → ${String(r.phone)}` : ""}
                      <div className="muted" style={{ fontSize: 12 }}>#{r.publicId} · {r.email} · {when(r.createdAt)}{r.cost ? ` · cost ${String(r.cost)}` : ""}{r.costKobo ? ` · cost ≈ ${naira(Number(r.costKobo))}` : ""}{r.orderNo ? ` · order ${String(r.orderNo)}` : ""}</div>
                      {r.error && <div className="muted" style={{ fontSize: 12 }}>Note: {r.error}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span>{naira(r.priceKobo)}</span>
                      <span className={`ap-tag${r.status === "delivered" ? " ok" : ""}`}>{STATUS[r.status] ?? r.status}</span>
                      {r.status === "pending" && <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => { if (window.confirm("Check with the provider one last time, then refund the customer if it still isn't delivered?")) void act({ action: `${prefix}Refund`, id: r.id }, (x) => `Order is now: ${String(x.status)}.`); }}>Check / refund</button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {tab === "airtime" && "operators" in data && (
            <section className="card glass">
              <h2>Networks from Reloadly</h2>
              {data.operators.length === 0 ? <div className="empty">None loaded yet.</div> : (
                <ul className="vc-admin-list">
                  {data.operators.map((o) => <li key={o.id}><span><strong>{o.name}</strong> <span className="muted" style={{ fontSize: 12 }}>#{o.id}</span></span><span className="muted" style={{ fontSize: 13 }}>{o.data ? "Data" : "Airtime"} · {o.type === "RANGE" ? "any amount" : `${o.plans} plans`} · charged in {o.currency}</span></li>)}
                </ul>
              )}
            </section>
          )}

          {(tab === "gift" || tab === "travel") && (
            <section className="card glass">
              <h2>{tab === "gift" ? "Gift cards" : "Packages"}</h2>
              <p className="muted" style={{ fontSize: 13 }}>{tab === "gift" ? "Star a card to show it first; hide ones you don't want to sell." : "Search by name, code or country code (e.g. GB). Hide ones you don't want to sell."}</p>
              <form className="ap-search" onSubmit={(e) => { e.preventDefault(); void load(tab, q); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                <input type="search" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "gift" ? "Search: Amazon, Steam…" : "Search: Europe, GB, 10GB…"} aria-label="Search" />
              </form>
              <ul className="vc-admin-list">
                {"products" in data && data.products.map((p) => (
                  <li key={p.id}>
                    <span style={{ minWidth: 0 }}><strong>{p.name}</strong> <span className="muted" style={{ fontSize: 12 }}>{p.country}{p.hidden ? " · hidden" : ""}{p.featured ? " · ★ starred" : ""}</span></span>
                    <span style={{ display: "flex", gap: 6 }}>
                      <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => void act({ action: "giftFlags", ids: [p.id], featured: !p.featured }, p.featured ? "Unstarred." : "Starred: shown first.")}>{p.featured ? "Unstar" : "★ Star"}</button>
                      <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => void act({ action: "giftFlags", ids: [p.id], hidden: !p.hidden }, p.hidden ? "Visible again." : "Hidden from customers.")}>{p.hidden ? "Show" : "Hide"}</button>
                    </span>
                  </li>
                ))}
                {"packages" in data && data.packages.map((p) => (
                  <li key={p.code}>
                    <span style={{ minWidth: 0 }}><strong>{p.name}</strong> <span className="muted" style={{ fontSize: 12 }}>{p.data} · {p.days} · {p.countries} {p.countries === 1 ? "country" : "countries"}{p.hidden ? " · hidden" : ""}</span></span>
                    <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span className="muted" style={{ fontSize: 13 }}>cost {naira(p.costKobo)} → sells {naira(p.priceKobo)}</span>
                      <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => void act({ action: "travelHide", codes: [p.code], hidden: !p.hidden }, p.hidden ? "Visible again." : "Hidden from customers.")}>{p.hidden ? "Show" : "Hide"}</button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
