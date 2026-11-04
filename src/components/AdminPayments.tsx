"use client";

import { useCallback, useEffect, useState } from "react";
import { api, naira } from "./api";

type Method = {
  id: string; kind: "bank" | "crypto"; label: string; enabled: boolean;
  bankName: string; accountNumber: string; accountName: string; coin: string; network: string; address: string; note: string;
};
type Config = { enabled: boolean; cryptoRateKobo: number; notifyEmails: string[]; methods: Method[] };
type Deposit = {
  id: string; publicId: number; method: string; kind: string; amountKobo: number; payAmount: string; proof: string; status: string;
  creditedKobo: number | null; note: string | null; createdAt: string;
  customer: { name: string; email: string; reference: string; newAccount: boolean };
};
type Data = { config: Config; siteRateKobo: number; adminEmails: string[]; emailOn: boolean; deposits: Deposit[] };
type Msg = { ok: boolean; text: string } | null;

const when = (d: string) => new Date(d).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
type Preset = "bank" | "usdt" | "btc";
const blank = (preset: Preset): Method => {
  const kind = preset === "bank" ? "bank" : "crypto";
  const crypto = preset === "btc" ? { label: "Bitcoin (BTC)", coin: "BTC", network: "Bitcoin" } : preset === "usdt" ? { label: "USDT (TRC20)", coin: "USDT", network: "TRC20 (Tron)" } : { label: "Bank transfer", coin: "", network: "" };
  return {
    id: `${preset}-${Math.random().toString(36).slice(2, 8)}`, kind, enabled: true,
    bankName: "", accountNumber: "", accountName: "", address: "", note: "", ...crypto,
  };
};

export function AdminPayments() {
  const [data, setData] = useState<Data | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [rate, setRate] = useState("");
  const [emails, setEmails] = useState("");
  const [credit, setCredit] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<Data>("/api/admin/payments");
      setData(d); setCfg(d.config);
      setRate(d.config.cryptoRateKobo ? String(d.config.cryptoRateKobo / 100) : "");
      setEmails(d.config.notifyEmails.join(", "));
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(body: unknown, ok: string) {
    setBusy(true); setMsg(null);
    try { await api("/api/admin/payments", body); setMsg({ ok: true, text: ok }); await load(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  if (error) return <div className="form-error" role="alert">{error}</div>;
  if (!data || !cfg) return <p className="muted" role="status">Loading…</p>;
  const setM = (i: number, patch: Partial<Method>) => setCfg((c) => c && { ...c, methods: c.methods.map((m, k) => (k === i ? { ...m, ...patch } : m)) });
  const save = () => act({
    action: "config",
    config: { ...cfg, cryptoRateKobo: rate.trim() ? Math.round(Number(rate) * 100) : 0, notifyEmails: emails.split(/[,\s]+/).filter(Boolean) },
  }, "Saved. Customers see the changes straight away.");
  const pending = data.deposits.filter((d) => d.status === "pending");

  return (
    <>
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      <section className="card glass">
        <h2>To confirm ({pending.length})</h2>
        {pending.length === 0 ? <div className="empty">Nothing waiting. You&apos;ll get an email when a customer says they&apos;ve paid.</div> : (
          <ul className="vc-admin-list">
            {pending.map((d) => (
              <li key={d.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
                <div>
                  <strong>{d.payAmount}</strong> via {d.method} → credit <b>{naira(d.amountKobo)}</b>
                  <div className="muted" style={{ fontSize: 13 }}>#P-{d.publicId} · {d.customer.name} ({d.customer.email}) · {when(d.createdAt)}{d.customer.newAccount ? " · ⚠ account under 3 days old" : ""}</div>
                  <div style={{ fontSize: 13, overflowWrap: "anywhere" }}>{d.kind === "crypto" ? "Transaction ID" : "Paid from"}: <code className="ap-code">{d.proof}</code>{d.kind === "bank" ? <> · narration code <code className="ap-code">{d.customer.reference}</code></> : null}</div>
                </div>
                <div className="vc-price-form">
                  <label>Credit ₦ <input className="input" style={{ width: 130 }} inputMode="decimal" placeholder={String(d.amountKobo / 100)} value={credit[d.id] ?? ""} onChange={(e) => setCredit((c) => ({ ...c, [d.id]: e.target.value }))} /></label>
                  <button type="button" className="btn btn-primary ap-mini" disabled={busy} onClick={() => {
                    const n = credit[d.id]?.trim() ? Number(credit[d.id]) : d.amountKobo / 100;
                    if (window.confirm(`Credit ₦${n.toLocaleString("en-NG")} to ${d.customer.name}'s wallet? Only do this if the money has arrived.`)) void act({ action: "confirm", id: d.id, naira: n }, `Confirmed: ₦${n.toLocaleString("en-NG")} added to ${d.customer.name}'s wallet. They've been emailed.`);
                  }}>Confirm & fund</button>
                  <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => setRejecting(rejecting === d.id ? null : d.id)}>Reject</button>
                </div>
                {rejecting === d.id && (
                  <div className="vc-price-form">
                    <input className="input" style={{ flex: "1 1 220px" }} placeholder="Reason (the customer sees this)" value={reason[d.id] ?? ""} onChange={(e) => setReason((r) => ({ ...r, [d.id]: e.target.value }))} />
                    <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => void act({ action: "reject", id: d.id, reason: reason[d.id] ?? "" }, "Rejected. The customer has been emailed.")}>Send rejection</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card glass">
        <h2>Where customers pay</h2>
        {!data.emailOn && <div className="form-error" role="alert">Email isn&apos;t set up, so you won&apos;t get notifications.</div>}
        <label className="ap-toggle"><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /><span>Show &ldquo;Pay by bank transfer or crypto&rdquo; in customers&apos; Wallet</span></label>
        {cfg.methods.length === 0 && <div className="empty">Add a bank account or a crypto wallet below.</div>}
        {cfg.methods.map((m, i) => (
          <div key={m.id} className="ap-subform" style={{ gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <strong>{m.kind === "bank" ? "🏦 Bank account" : m.coin === "BTC" ? "₿ Bitcoin wallet" : "🪙 Crypto wallet"}</strong>
              <span style={{ display: "flex", gap: 8 }}>
                <label className="ap-toggle"><input type="checkbox" checked={m.enabled} onChange={(e) => setM(i, { enabled: e.target.checked })} /><span>On</span></label>
                <button type="button" className="btn btn-ghost ap-mini" onClick={() => setCfg({ ...cfg, methods: cfg.methods.filter((_, k) => k !== i) })}>Remove</button>
              </span>
            </div>
            <div className="field"><label htmlFor={`label-${m.id}`}>Name customers see</label><input id={`label-${m.id}`} className="input" value={m.label} onChange={(e) => setM(i, { label: e.target.value })} /></div>
            {m.kind === "bank" ? (
              <>
                <div className="field"><label htmlFor={`bank-${m.id}`}>Bank</label><input id={`bank-${m.id}`} className="input" value={m.bankName} onChange={(e) => setM(i, { bankName: e.target.value })} placeholder="e.g. Opay, GTBank" /></div>
                <div className="field"><label htmlFor={`acct-${m.id}`}>Account number (10 digits)</label><input id={`acct-${m.id}`} className="input" inputMode="numeric" maxLength={10} value={m.accountNumber} onChange={(e) => setM(i, { accountNumber: e.target.value.replace(/\D/g, "") })} /></div>
                <div className="field"><label htmlFor={`acctname-${m.id}`}>Account name</label><input id={`acctname-${m.id}`} className="input" value={m.accountName} onChange={(e) => setM(i, { accountName: e.target.value })} /></div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <div className="field" style={{ flex: "1 1 100px" }}><label htmlFor={`coin-${m.id}`}>Coin</label><input id={`coin-${m.id}`} className="input" value={m.coin} onChange={(e) => setM(i, { coin: e.target.value.toUpperCase() })} placeholder="USDT" /></div>
                  <div className="field" style={{ flex: "2 1 180px" }}><label htmlFor={`net-${m.id}`}>Network</label><input id={`net-${m.id}`} className="input" value={m.network} onChange={(e) => setM(i, { network: e.target.value })} placeholder="TRC20 (Tron), Bitcoin, BEP20…" /></div>
                </div>
                <div className="field"><label htmlFor={`addr-${m.id}`}>Wallet address</label><input id={`addr-${m.id}`} className="input" value={m.address} onChange={(e) => setM(i, { address: e.target.value.trim() })} spellCheck={false} /></div>
              </>
            )}
            <div className="field"><label htmlFor={`note-${m.id}`}>Extra note for customers (optional)</label><input id={`note-${m.id}`} className="input" value={m.note} onChange={(e) => setM(i, { note: e.target.value })} /></div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost ap-mini" onClick={() => setCfg({ ...cfg, methods: [...cfg.methods, blank("bank")] })}>+ Bank account</button>
          <button type="button" className="btn btn-ghost ap-mini" onClick={() => setCfg({ ...cfg, methods: [...cfg.methods, blank("usdt")] })}>+ USDT wallet</button>
          <button type="button" className="btn btn-ghost ap-mini" onClick={() => setCfg({ ...cfg, methods: [...cfg.methods, blank("btc")] })}>+ Bitcoin wallet</button>
        </div>
        <div className="field">
          <label htmlFor="ap-rate">Crypto rate: ₦ per $1 (leave empty to use the site dollar rate, now ₦{(data.siteRateKobo / 100).toLocaleString("en-NG")})</label>
          <input id="ap-rate" className="input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} />
        </div>
        <div className="field">
          <label htmlFor="ap-emails">Also email these addresses (optional, comma separated)</label>
          <input id="ap-emails" className="input" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="support@almightypumps.com" />
          <span className="muted" style={{ fontSize: 12 }}>Every admin already gets the emails: {data.adminEmails.join(", ")}.</span>
        </div>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</button>
      </section>

      <section className="card glass">
        <h2>History</h2>
        {data.deposits.filter((d) => d.status !== "pending").length === 0 ? <div className="empty">No confirmed or rejected payments yet.</div> : (
          <ul className="vc-admin-list">
            {data.deposits.filter((d) => d.status !== "pending").map((d) => (
              <li key={d.id}>
                <span style={{ minWidth: 0 }}><strong>{d.payAmount}</strong> via {d.method} <span className="muted" style={{ fontSize: 12 }}>#P-{d.publicId} · {d.customer.email} · {when(d.createdAt)}{d.note ? ` · ${d.note}` : ""}</span></span>
                <span className={`ap-tag${d.status === "confirmed" ? " ok" : ""}`}>{d.status === "confirmed" ? `Funded ${naira(d.creditedKobo ?? 0)}` : "Rejected"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
