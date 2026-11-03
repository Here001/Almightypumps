"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, naira } from "./api";

const naira_ = naira;

type Overview = {
  config: { markupBps: number; enabled: boolean; syncedAt: string | null };
  configured: boolean;
  balance: { usd: number | null; error: string | null };
  usdRateKobo: number;
  stats: { completed: number; refunded: number; pending: number; revenueKobo: number; costKobo: number };
  recent: { id: string; service: string; status: string; priceKobo: number; costMilli: number; createdAt: string; email: string }[];
  services: { name: string; label: string; hidden: boolean; costMilli: number | null; costKobo: number | null; markupPriceKobo: number | null; fixedPriceKobo: number | null; priceKobo: number | null }[];
};
type Msg = { ok: boolean; text: string } | null;

export function AdminVerify() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markup, setMarkup] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [onlyHidden, setOnlyHidden] = useState(false);
  const [onlyFixed, setOnlyFixed] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<Overview>("/api/admin/verify");
      setData(d);
      setMarkup(String(d.config.markupBps / 100));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(body: unknown, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/admin/verify", body);
      setMsg({ ok: true, text: ok });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const services = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.services ?? []).filter((x) => (!onlyHidden || x.hidden) && (!onlyFixed || x.fixedPriceKobo) && (!s || x.name.toLowerCase().includes(s) || x.label.toLowerCase().includes(s)));
  }, [data, q, onlyHidden, onlyFixed]);

  async function savePrice(name: string, label: string, naira: number | null) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ belowCost: boolean; costKobo: number | null }>("/api/admin/verify", { action: "price", name, naira });
      setMsg(naira === null
        ? { ok: true, text: `${label} is back on the ${markup}% markup.` }
        : r.belowCost
          ? { ok: false, text: `Saved, but ₦${naira.toLocaleString("en-NG")} is BELOW your cost (${r.costKobo ? naira_(r.costKobo) : "?"}). You lose money on every ${label} code.` }
          : { ok: true, text: `${label} now sells for ₦${naira.toLocaleString("en-NG")}${r.costKobo ? ` (your cost ≈ ${naira_(r.costKobo)})` : ""}.` });
      setEditing(null);
      await load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="form-error" role="alert">{error}</div>;
  if (!data) return <p className="muted" role="status">Loading…</p>;
  const m = Number(markup);
  const example = data.usdRateKobo ? Math.ceil(((500 * data.usdRateKobo) / 1000) * (1 + (Number.isFinite(m) ? m : 0) / 100) / 1000) * 1000 : 0;
  const profit = data.stats.revenueKobo - data.stats.costKobo;

  return (
    <>
      {!data.configured && <div className="form-error" role="alert">TextVerified isn&apos;t connected: add TEXTVERIFIED_API_KEY and TEXTVERIFIED_API_USERNAME in Vercel, then redeploy.</div>}
      <div className="tiles">
        <div className="tile glass">
          <div className="tile-label">TextVerified balance</div>
          <div className="tile-num">{data.balance.usd !== null ? `$${data.balance.usd.toFixed(2)}` : "–"}</div>
          <div className="muted tile-sub">{data.balance.error ?? (data.usdRateKobo && data.balance.usd !== null ? `≈ ${naira(Math.round(data.balance.usd * data.usdRateKobo))} · top up on textverified.com` : "top up on textverified.com")}</div>
        </div>
        <div className="tile glass"><div className="tile-label">Codes delivered</div><div className="tile-num">{data.stats.completed}</div><div className="muted tile-sub">{data.stats.refunded} refunded · {data.stats.pending} waiting</div></div>
        <div className="tile glass"><div className="tile-label">Profit</div><div className="tile-num">{naira(profit)}</div><div className="muted tile-sub">{naira(data.stats.revenueKobo)} sales − {naira(data.stats.costKobo)} cost (today&apos;s $ rate)</div></div>
      </div>

      <section className="card glass">
        <h2>Price</h2>
        <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={(e) => { e.preventDefault(); void act({ action: "config", markupPercent: Number(markup) }, "Markup saved. New prices apply straight away."); }}>
          <div className="field">
            <label htmlFor="vm">Markup on TextVerified&apos;s price (%)</label>
            <input id="vm" className="input" inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} style={{ maxWidth: 180 }} />
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            {example ? <>Example: a code that costs you $0.50 sells for <strong>{naira(example)}</strong> at {markup || 0}%. Prices use the site&apos;s dollar rate ({naira(data.usdRateKobo)} per $1) and round up to the next ₦10.</> : "Set the dollar rate in Admin → Pricing first."}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary" disabled={busy}>Save markup</button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void act({ action: "config", enabled: !data.config.enabled }, data.config.enabled ? "Paused: customers can't buy codes." : "Live: customers can buy codes.")}>
              {data.config.enabled ? "Pause sales" : "Resume sales"}
            </button>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Status: <strong>{data.config.enabled ? "On sale" : "Paused"}</strong></p>
        </form>
        {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      </section>

      <section className="card glass">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <h2>Apps ({data.services.length})</h2>
          <button type="button" className="btn btn-ghost ap-mini" disabled={busy || !data.configured} onClick={() => void act({ action: "sync" }, "App list refreshed from TextVerified.")}>Refresh list</button>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Tap <strong>Set price</strong> to give an app its own fixed Naira price instead of the markup. The list refreshes itself daily{data.config.syncedAt ? ` (last: ${new Date(data.config.syncedAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })})` : ""}. Prices show once someone has looked an app up.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search apps" aria-label="Search apps" style={{ flex: "1 1 200px" }} />
          <label className="ap-toggle"><input type="checkbox" checked={onlyHidden} onChange={(e) => setOnlyHidden(e.target.checked)} /><span>Hidden only</span></label>
          <label className="ap-toggle"><input type="checkbox" checked={onlyFixed} onChange={(e) => setOnlyFixed(e.target.checked)} /><span>Fixed prices only</span></label>
        </div>
        <ul className="vc-admin-list">
          {services.slice(0, 200).map((s) => (
            <li key={s.name} style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                  <strong>{s.label}</strong>
                  {s.fixedPriceKobo && <span className="ap-tag ok" style={{ marginLeft: 6 }}>Fixed {naira(s.fixedPriceKobo)}</span>}
                  {s.hidden && <span className="ap-tag" style={{ marginLeft: 6 }}>Hidden</span>}
                </span>
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => { setEditing(editing === s.name ? null : s.name); setPriceInput(s.fixedPriceKobo ? String(s.fixedPriceKobo / 100) : ""); }}>
                    {s.fixedPriceKobo ? "Change price" : "Set price"}
                  </button>
                  <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => void act({ action: "hide", names: [s.name], hidden: !s.hidden }, s.hidden ? `${s.label} is back on sale.` : `${s.label} hidden from customers.`)}>
                    {s.hidden ? "Show" : "Hide"}
                  </button>
                </span>
              </div>
              <span className="muted" style={{ fontSize: 13 }}>
                {s.costMilli ? <>Cost ${(s.costMilli / 1000).toFixed(2)}{s.costKobo ? ` ≈ ${naira(s.costKobo)}` : ""} · with markup {s.markupPriceKobo ? naira(s.markupPriceKobo) : "–"}{s.fixedPriceKobo ? <> · <strong>customers pay {naira(s.fixedPriceKobo)}</strong></> : ""}</> : s.fixedPriceKobo ? `Customers pay ${naira(s.fixedPriceKobo)} (cost not checked yet)` : "Not priced yet: open it once to fetch its cost"}
              </span>
              {editing === s.name && (
                <form className="vc-price-form" onSubmit={(e) => { e.preventDefault(); const n = Number(priceInput.replace(/[₦,\s]/g, "")); if (!(n > 0)) { setMsg({ ok: false, text: "Enter a price in Naira, e.g. 2500." }); return; } void savePrice(s.name, s.label, n); }}>
                  <label htmlFor={`fp-${s.name}`} className="muted" style={{ fontSize: 13 }}>Fixed price (₦)</label>
                  <input id={`fp-${s.name}`} className="input" inputMode="decimal" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} placeholder="e.g. 2500" autoFocus style={{ maxWidth: 160 }} />
                  <button className="btn btn-primary ap-mini" disabled={busy}>Save</button>
                  {s.fixedPriceKobo && <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => void savePrice(s.name, s.label, null)}>Use markup instead</button>}
                  <button type="button" className="btn btn-ghost ap-mini" onClick={() => setEditing(null)}>Cancel</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {services.length > 200 && <p className="muted" style={{ fontSize: 13 }}>Showing 200 of {services.length}. Search to find others.</p>}
      </section>

      <section className="card glass">
        <h2>Recent</h2>
        {data.recent.length === 0 ? <div className="empty">No codes sold yet.</div> : (
          <ul className="vc-admin-list">
            {data.recent.map((r) => (
              <li key={r.id}>
                <span style={{ minWidth: 0, overflowWrap: "anywhere" }}><strong>{r.service}</strong> <span className="muted" style={{ fontSize: 13 }}>{r.email}</span></span>
                <span className="muted" style={{ fontSize: 13 }}>{new Date(r.createdAt).toLocaleString("en-NG", { dateStyle: "short", timeStyle: "short" })}</span>
                <span><span className={`ap-tag${r.status === "completed" ? " ok" : ""}`}>{r.status}</span> {r.status === "completed" ? naira(r.priceKobo) : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
