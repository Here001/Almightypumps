"use client";

import { useCallback, useEffect, useState } from "react";
import { api, naira } from "./api";

type Data = {
  config: { enabled: boolean; permanent: boolean }; keySet: boolean; permanentAccounts: number;
  recent: { reference: string; amount: number; paidAt: string | null; name: string; email: string }[];
};

/** Admin switch for automatic bank-transfer top-ups (Flutterwave account numbers) + the latest ones. */
export function AdminBankTransfer() {
  const [d, setD] = useState<Data | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<Data>("/api/admin/bank-transfer").then(setD).catch((e) => setMsg({ ok: false, text: (e as Error).message })), []);
  useEffect(() => { void load(); }, [load]);
  if (!d) return msg ? <div className="form-error" role="alert">{msg.text}</div> : null;

  async function save(next: Data["config"], text: string) {
    setBusy(true); setMsg(null);
    try { await api("/api/admin/bank-transfer", next); setMsg({ ok: true, text }); await load(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  return (
    <section className="card glass">
      <div className="ap-list-head">
        <h2>Automatic bank transfer</h2>
        <span className={`ap-tag${d.config.enabled ? " ok" : ""}`}>{d.config.enabled ? "ON" : "OFF"}</span>
      </div>
      <p className="muted" style={{ fontSize: 14 }}>
        Customers get an account number from Flutterwave, send money from their bank app, and their wallet is topped up automatically.
        No checking or confirming for you. Flutterwave charges its transfer fee to you, so customers get the full amount they send.
      </p>
      {!d.keySet && <div className="form-error" role="alert">Flutterwave isn&apos;t connected on this site (no secret key), so this can&apos;t be switched on yet.</div>}
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
        <input type="checkbox" checked={d.config.permanent} disabled={busy} onChange={(e) => void save({ ...d.config, permanent: e.target.checked }, e.target.checked ? "Customers can now get a permanent account number (with their BVN)." : "Permanent account numbers turned off. Existing ones keep working.")} />
        Let customers get their own permanent account number (they enter their BVN once; we don&apos;t store it)
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className={d.config.enabled ? "btn btn-ghost" : "btn btn-primary"} disabled={busy || (!d.keySet && !d.config.enabled)}
          onClick={() => void save({ ...d.config, enabled: !d.config.enabled }, d.config.enabled ? "Automatic bank transfer is OFF." : "Automatic bank transfer is ON. Customers see it in their Wallet.")}>
          {d.config.enabled ? "Turn off" : "Turn on"}
        </button>
      </div>
      <p className="muted" style={{ fontSize: 13, overflowWrap: "anywhere" }}>
        Before turning on: in your Flutterwave dashboard, make sure your account is approved for live payments and that
        Settings → Webhooks points to https://almightypumps.com/api/webhooks/flutterwave with your secret hash. {d.permanentAccounts} customer{d.permanentAccounts === 1 ? " has" : "s have"} a permanent account number.
      </p>
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      {d.recent.length > 0 && (
        <>
          <h3 style={{ fontSize: 15, marginTop: 8 }}>Latest automatic top-ups</h3>
          <ul className="vc-admin-list">
            {d.recent.map((r) => (
              <li key={r.reference}><div><strong>{r.name}</strong> <span className="muted" style={{ fontSize: 13 }}>{r.email}{r.paidAt ? ` · ${new Date(r.paidAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}` : ""}</span></div><strong>{naira(r.amount)}</strong></li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
