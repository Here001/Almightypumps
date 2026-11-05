"use client";

import { useCallback, useEffect, useState } from "react";
import { api, naira } from "./api";

type Row = { id: string; code: string; status: string; carrier: string | null; priceKobo: number | null; costKobo: number | null; error: string | null; createdAt: string; route: string; customer: { name: string; email: string }; carrierTracking: string | null; labelUrl: string | null };
type Data = { config: { enabled: boolean; markupBps: number }; keySet: boolean; sandbox: boolean; totals: { booked: number; profitKobo: number }; shipments: Row[] };
const LABEL: Record<string, string> = { booking: "Booking…", booked: "Waiting for pickup", in_transit: "On the way", delivered: "Delivered", cancelled: "Cancelled (refunded)", failed: "Failed (refunded)" };

export function AdminShipping() {
  const [d, setD] = useState<Data | null>(null);
  const [markup, setMarkup] = useState("15");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<Data>("/api/admin/shipping").then((x) => { setD(x); setMarkup(String(x.config.markupBps / 100)); }).catch((e) => setMsg({ ok: false, text: (e as Error).message })), []);
  useEffect(() => { void load(); }, [load]);
  async function act(body: unknown, ok: string) {
    setBusy(true); setMsg(null);
    try { await api("/api/admin/shipping", body); setMsg({ ok: true, text: ok }); await load(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  }
  if (!d) return msg ? <div className="form-error" role="alert">{msg.text}</div> : <p className="muted" role="status">Loading…</p>;
  const cfg = (enabled: boolean) => ({ action: "config", config: { enabled, markupBps: Math.round((Number(markup) || 0) * 100) } });
  return (
    <>
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      <section className="card glass">
        <div className="ap-list-head"><h2>Settings</h2><span className={`ap-tag${d.config.enabled && d.keySet ? " ok" : ""}`}>{!d.keySet ? "Not connected" : d.config.enabled ? (d.sandbox ? "ON · test mode" : "ON") : "Paused"}</span></div>
        {!d.keySet && <div className="form-error" role="alert">Add your Terminal Africa secret key in Vercel (TERMINAL_AFRICA_SECRET_KEY) to switch this on.</div>}
        {d.keySet && d.sandbox && <p className="muted" style={{ fontSize: 13 }}>Using Terminal Africa&apos;s test mode: no real pickups and no real money. Swap in your live key when you&apos;re ready.</p>}
        <div className="bt-form">
          <div className="field" style={{ flex: "0 1 200px" }}><label htmlFor="sh-mk">Your markup (%)</label><input id="sh-mk" className="input" inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} /></div>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act(cfg(d.config.enabled), "Saved.")}>Save</button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void act(cfg(!d.config.enabled), d.config.enabled ? "Paused: customers can't book." : "Customers can book again.")}>{d.config.enabled ? "Pause" : "Resume"}</button>
          <button type="button" className="btn btn-ghost" disabled={busy || !d.keySet} onClick={() => void act({ action: "refresh" }, "Tracking updated.")}>Update tracking now</button>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>Prices are rounded up to the next ₦50. Keep your Terminal Africa wallet topped up: if it runs out, customers see &ldquo;temporarily unavailable&rdquo;, get their money back, and you get an email.</p>
      </section>
      <div className="tiles">
        <div className="tile glass"><div className="tile-label">Packages booked</div><div className="tile-num">{d.totals.booked}</div></div>
        <div className="tile glass"><div className="tile-label">Your profit</div><div className="tile-num">{naira(d.totals.profitKobo)}</div></div>
      </div>
      <section className="card glass">
        <h2>Packages</h2>
        {d.shipments.length === 0 ? <div className="empty">No packages yet.</div> : (
          <ul className="vc-admin-list">
            {d.shipments.map((s) => (
              <li key={s.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                <div><strong>{s.route}</strong> <span className="muted" style={{ fontSize: 13 }}>{s.code}{s.carrier ? ` · ${s.carrier}` : ""}{s.carrierTracking ? ` · ${s.carrierTracking}` : ""} · {s.customer.name} ({s.customer.email}) · {new Date(s.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</span></div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className={`ap-tag${s.status === "delivered" ? " ok" : ""}`}>{LABEL[s.status] ?? s.status}</span>
                  {s.priceKobo != null && <span className="muted" style={{ fontSize: 13 }}>paid {naira(s.priceKobo)}{s.costKobo != null ? ` · courier ${naira(s.costKobo)}` : ""}</span>}
                  {s.error && <span className="muted" style={{ fontSize: 13 }}>Reason: {s.error}</span>}
                  <a className="ap-link" style={{ fontSize: 13 }} href={`/track?code=${s.code}`} target="_blank" rel="noopener noreferrer">Track</a>
                  {s.labelUrl && <a className="ap-link" style={{ fontSize: 13 }} href={s.labelUrl} target="_blank" rel="noopener noreferrer">Label</a>}
                  {s.status === "booked" && <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => { if (window.confirm(`Cancel ${s.code} and refund the customer?`)) void act({ action: "cancel", id: s.id }, "Cancelled and refunded."); }}>Cancel & refund</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
