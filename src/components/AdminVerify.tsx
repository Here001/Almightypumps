"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, naira } from "./api";

type Overview = {
  config: { markupBps: number; enabled: boolean; syncedAt: string | null };
  configured: boolean;
  balance: { usd: number | null; error: string | null };
  usdRateKobo: number;
  stats: { completed: number; refunded: number; pending: number; revenueKobo: number; costKobo: number };
  recent: { id: string; service: string; status: string; priceKobo: number; costMilli: number; createdAt: string; email: string }[];
  services: { name: string; label: string; hidden: boolean; costMilli: number | null; priceKobo: number | null }[];
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
    return (data?.services ?? []).filter((x) => (!onlyHidden || x.hidden) && (!s || x.name.toLowerCase().includes(s)));
  }, [data, q, onlyHidden]);

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
          The list refreshes itself daily{data.config.syncedAt ? ` (last: ${new Date(data.config.syncedAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })})` : ""}. Prices show once someone has looked an app up.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search apps" aria-label="Search apps" style={{ flex: "1 1 200px" }} />
          <label className="ap-toggle"><input type="checkbox" checked={onlyHidden} onChange={(e) => setOnlyHidden(e.target.checked)} /><span>Hidden only</span></label>
        </div>
        <ul className="vc-admin-list">
          {services.slice(0, 200).map((s) => (
            <li key={s.name}>
              <span style={{ minWidth: 0, overflowWrap: "anywhere" }}><strong>{s.label}</strong>{s.hidden && <span className="ap-tag" style={{ marginLeft: 6 }}>Hidden</span>}</span>
              <span className="muted" style={{ fontSize: 13 }}>{s.costMilli ? `$${(s.costMilli / 1000).toFixed(2)} → ${s.priceKobo ? naira(s.priceKobo) : "–"}` : "not priced yet"}</span>
              <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => void act({ action: "hide", names: [s.name], hidden: !s.hidden }, s.hidden ? `${s.label} is back on sale.` : `${s.label} hidden from customers.`)}>
                {s.hidden ? "Show" : "Hide"}
              </button>
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
