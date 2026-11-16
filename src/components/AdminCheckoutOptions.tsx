"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

type Opts = { bankTransfer: boolean; ussd: boolean };
const ROWS: { key: keyof Opts; label: string; hint: string }[] = [
  { key: "bankTransfer", label: "Bank transfer", hint: "Flutterwave shows a one-time account number on its payment page; the wallet is topped up when the transfer arrives." },
  { key: "ussd", label: "USSD", hint: "Customers pay by dialling their bank's USSD code." },
];

/** Admin: which ways to pay appear on Flutterwave's checkout page when customers tap "Fund wallet". Card is always on. */
export function AdminCheckoutOptions() {
  const [o, setO] = useState<Opts | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { api<Opts>("/api/admin/checkout-options").then(setO).catch((e) => setMsg({ ok: false, text: (e as Error).message })); }, []);
  if (!o) return msg ? <div className="form-error" role="alert">{msg.text}</div> : null;

  async function toggle(key: keyof Opts) {
    const next = { ...o!, [key]: !o![key] };
    setBusy(true); setMsg(null);
    try { await api("/api/admin/checkout-options", next); setO(next); setMsg({ ok: true, text: `${ROWS.find((r) => r.key === key)!.label} is now ${next[key] ? "ON" : "OFF"} on the Fund wallet page.` }); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  return (
    <section className="card glass">
      <h2>Fund wallet page (Flutterwave)</h2>
      <p className="muted" style={{ fontSize: 14 }}>When customers tap “Fund wallet”, Flutterwave&apos;s payment page opens. Card payments are always on. Choose which other ways to pay they see there.</p>
      <ul className="sw-list">
        {ROWS.map((r) => (
          <li key={r.key}>
            <div style={{ minWidth: 0 }}><strong>{r.label}</strong><span className="muted">{r.hint}</span></div>
            <button type="button" role="switch" aria-checked={o[r.key]} aria-label={`${r.label}: ${o[r.key] ? "on" : "off"}`} className={`sw${o[r.key] ? " on" : ""}`} disabled={busy} onClick={() => void toggle(r.key)}>
              <span className="sw-knob" aria-hidden="true" /><span className="sw-text">{o[r.key] ? "ON" : "OFF"}</span>
            </button>
          </li>
        ))}
      </ul>
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role="status">{msg.text}</div>}
    </section>
  );
}
