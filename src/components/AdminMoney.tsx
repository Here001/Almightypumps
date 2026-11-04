"use client";

import { useCallback, useEffect, useState } from "react";
import { api, naira } from "./api";
import { payoutSplit } from "@/core/escrow";

type Msg = { ok: boolean; text: string } | null;
const when = (d: string | null) => (d ? new Date(d).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }) : "");

function useView<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try { setData(await api<T>(url)); } catch (e) { setError((e as Error).message); }
  }, [url]);
  useEffect(() => { setData(null); void load(); }, [load]);
  return { data, error, load };
}

/* ---------------- Platform wallet ---------------- */

type Overview = {
  balance: { available: number; held: number };
  sources: { kind: string; label: string; all: number; d1: number; d7: number; d30: number; count: number }[];
  customers: { available: number; held: number };
  pendingWithdrawals: { count: number; total: number };
  deposits30d: number;
  openDisputes: number;
  recent: { kind: string; label: string; amount: number; memo: string | null; at: string }[];
};

export function AdminWallet() {
  const { data, error } = useView<Overview>("/api/admin/money?view=wallet");
  if (error) return <div className="form-error" role="alert">{error}</div>;
  if (!data) return <p className="muted" role="status">Loading…</p>;
  const total = data.sources.reduce((s, x) => s + x.all, 0);
  return (
    <>
      <div className="tiles">
        <div className="tile glass"><div className="tile-label">Platform wallet</div><div className="tile-num">{naira(data.balance.available)}</div><div className="muted tile-sub">everything the business has taken in</div></div>
        <div className="tile glass"><div className="tile-label">Customer money held</div><div className="tile-num">{naira(data.customers.available + data.customers.held)}</div><div className="muted tile-sub">owed to customers: {naira(data.customers.available)} in wallets + {naira(data.customers.held)} on hold</div></div>
        <div className="tile glass"><div className="tile-label">Withdrawals to pay</div><div className="tile-num">{naira(data.pendingWithdrawals.total)}</div><div className="muted tile-sub">{data.pendingWithdrawals.count} waiting · <a href="/admin/withdrawals">open</a></div></div>
        <div className="tile glass"><div className="tile-label">Open disputes</div><div className="tile-num">{data.openDisputes}</div><div className="muted tile-sub"><a href="/admin/disputes">open</a></div></div>
      </div>

      <section className="card glass">
        <h2>Earnings by source</h2>
        <p className="muted" style={{ fontSize: 13 }}>Sales are what customers paid; your provider costs (Owlet, TextVerified) are paid from your balances there, not from here. P2P fees are pure profit. Top-ups in the last 30 days: {naira(data.deposits30d)}.</p>
        {data.sources.length === 0 ? <div className="empty">No earnings yet.</div> : (
          <div className="mt-table-wrap">
            <table className="mt-table">
              <thead><tr><th>Source</th><th>Today</th><th>7 days</th><th>30 days</th><th>All time</th></tr></thead>
              <tbody>
                {data.sources.map((s) => (
                  <tr key={s.kind}><td>{s.label}</td><td>{naira(s.d1)}</td><td>{naira(s.d7)}</td><td>{naira(s.d30)}</td><td><strong>{naira(s.all)}</strong></td></tr>
                ))}
                <tr><td><strong>Total</strong></td><td>{naira(data.sources.reduce((a, s) => a + s.d1, 0))}</td><td>{naira(data.sources.reduce((a, s) => a + s.d7, 0))}</td><td>{naira(data.sources.reduce((a, s) => a + s.d30, 0))}</td><td><strong>{naira(total)}</strong></td></tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card glass">
        <h2>Latest</h2>
        {data.recent.length === 0 ? <div className="empty">Nothing yet.</div> : (
          <ul className="ap-list">
            {data.recent.map((r, i) => (
              <li key={i} className="ap-row">
                <div style={{ minWidth: 0 }}><div className="ap-row-title">{r.label}</div><div className="muted ap-row-sub">{when(r.at)}</div></div>
                <div className="ap-row-end"><strong style={{ color: r.amount >= 0 ? "var(--ok)" : "var(--fg)" }}>{r.amount >= 0 ? "+" : "−"}{naira(Math.abs(r.amount))}</strong></div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/* ---------------- Withdrawals ---------------- */

type Withdrawal = {
  id: string; amount: number; status: string; note: string | null; createdAt: string; decidedAt: string | null;
  bankName: string; accountNumber: string; accountName: string;
  user: { id: string; name: string; email: string; phone: string | null; joinedAt: string; seller: boolean };
  money: { deposits: number; sales: number; spent: number; available: number };
  flags: string[];
};

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="btn btn-ghost ap-mini" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* ignore */ } }}>{done ? "Copied" : "Copy"}</button>;
}

export function AdminWithdrawals() {
  const [status, setStatus] = useState<"requested" | "paid" | "rejected">("requested");
  const { data, error, load } = useView<Withdrawal[]>(`/api/admin/money?view=withdrawals&status=${status}`);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function decide(w: Withdrawal, decision: "paid" | "rejected", note?: string) {
    if (decision === "paid" && !window.confirm(`Have you sent ${naira(w.amount)} to ${w.accountName} (${w.bankName} ${w.accountNumber})?`)) return;
    setBusy(w.id);
    setMsg(null);
    try {
      await api(`/api/admin/withdrawals/${w.id}`, { decision, note });
      setMsg({ ok: true, text: decision === "paid" ? `Marked as paid: ${naira(w.amount)} to ${w.accountName}.` : `Rejected. ${naira(w.amount)} is back in ${w.user.name}'s wallet.` });
      setRejecting(null);
      setReason("");
      await load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="ap-chips" role="group" aria-label="Status">
        {(["requested", "paid", "rejected"] as const).map((s) => (
          <button key={s} type="button" className="ap-chip" aria-pressed={status === s} onClick={() => { setStatus(s); setMsg(null); }}>
            {s === "requested" ? "To pay" : s === "paid" ? "Paid" : "Rejected"}
          </button>
        ))}
      </div>
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}
      {!data && !error && <p className="muted" role="status">Loading…</p>}
      {data && data.length === 0 && <div className="empty">{status === "requested" ? "No withdrawals waiting. 🎉" : "Nothing here yet."}</div>}
      {data?.map((w) => (
        <section key={w.id} className="card glass">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
            <div className="tile-num">{naira(w.amount)}</div>
            <span className="muted" style={{ fontSize: 13 }}>{when(w.createdAt)}</span>
          </div>
          <dl className="ap-facts">
            <dt>Pay to</dt>
            <dd>
              <strong>{w.accountName}</strong><br />{w.bankName}<br />
              <span style={{ fontFamily: "var(--mono)", fontSize: 18, letterSpacing: ".05em" }}>{w.accountNumber}</span> <CopyBtn text={w.accountNumber} />
            </dd>
            <dt>Customer</dt>
            <dd>{w.user.name}{w.user.seller ? " (verified seller)" : ""}<br /><span className="muted">{w.user.email}{w.user.phone ? ` · ${w.user.phone}` : ""} · joined {new Date(w.user.joinedAt).toLocaleDateString("en-NG")}</span></dd>
            <dt>Their money</dt>
            <dd className="muted">Topped up {naira(w.money.deposits)} · earned from sales {naira(w.money.sales)} · spent {naira(w.money.spent)}</dd>
            {w.note && <><dt>Note</dt><dd>{w.note}</dd></>}
            {w.decidedAt && <><dt>Decided</dt><dd>{when(w.decidedAt)}</dd></>}
          </dl>
          {w.flags.length > 0 && (
            <div className="form-error" role="note">
              <strong>Check before paying:</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{w.flags.map((f) => <li key={f}>{f}</li>)}</ul>
            </div>
          )}
          {w.status === "requested" && (
            rejecting === w.id ? (
              <form style={{ display: "flex", flexDirection: "column", gap: 8 }} onSubmit={(e) => { e.preventDefault(); void decide(w, "rejected", reason); }}>
                <label htmlFor={`rr-${w.id}`} className="muted" style={{ fontSize: 13 }}>Reason (the customer sees this)</label>
                <input id={`rr-${w.id}`} className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Account name doesn't match your profile" autoFocus required minLength={3} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn btn-primary ap-mini" disabled={busy === w.id}>Reject & return money</button>
                  <button type="button" className="btn btn-ghost ap-mini" onClick={() => setRejecting(null)}>Cancel</button>
                </div>
              </form>
            ) : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-primary" disabled={busy === w.id} onClick={() => void decide(w, "paid")}>I&apos;ve sent it: mark paid</button>
                <button type="button" className="btn btn-ghost" disabled={busy === w.id} onClick={() => { setRejecting(w.id); setReason(""); }}>Reject</button>
              </div>
            )
          )}
        </section>
      ))}
    </>
  );
}

/* ---------------- Disputes ---------------- */

type Dispute = {
  id: string; publicId: number; status: string; amount: number; quantity: number; deliveryProof: string | null; createdAt: string; shippedAt: string | null;
  title: string; reason: string; openedAt: string; resolution: string | null; resolvedAt: string | null;
  buyer: { name: string; email: string; phone: string | null }; seller: { name: string; email: string; phone: string | null };
  timeline: { action: string; note: string | null; at: string; by: string }[];
  messages: { body: string; at: string; by: string }[];
};
const ACTION: Record<string, string> = {
  PAY: "Paid into escrow", SHIP: "Marked delivered", CONFIRM: "Confirmed received", DISPUTE: "Opened a dispute", CANCEL: "Cancelled",
  RESOLVE_BUYER: "Resolved: buyer refunded", RESOLVE_SELLER: "Resolved: seller paid", AUTO_RELEASE: "Auto-released after 48h", AUTO_CANCEL: "Auto-cancelled (not shipped in time)",
};

export function AdminDisputes() {
  const [which, setWhich] = useState<"open" | "resolved">("open");
  const { data, error, load } = useView<Dispute[]>(`/api/admin/money?view=disputes&status=${which}`);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function resolve(d: Dispute, action: "RESOLVE_BUYER" | "RESOLVE_SELLER") {
    const fee = payoutSplit(d.amount).fee;
    const q = action === "RESOLVE_BUYER"
      ? `Refund ${naira(d.amount)} to the buyer (${d.buyer.name})? The item goes back in stock.`
      : `Pay the seller (${d.seller.name}) ${naira(d.amount - fee)} after the 7% fee?`;
    if (!window.confirm(q)) return;
    setBusy(d.id);
    setMsg(null);
    try {
      await api(`/api/admin/trades/${d.id}`, { action, note: notes[d.id]?.trim() || undefined });
      setMsg({ ok: true, text: action === "RESOLVE_BUYER" ? `Trade #M-${d.publicId}: buyer refunded.` : `Trade #M-${d.publicId}: seller paid.` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="ap-chips" role="group" aria-label="Status">
        <button type="button" className="ap-chip" aria-pressed={which === "open"} onClick={() => { setWhich("open"); setMsg(null); }}>Open</button>
        <button type="button" className="ap-chip" aria-pressed={which === "resolved"} onClick={() => { setWhich("resolved"); setMsg(null); }}>Resolved</button>
      </div>
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}
      {!data && !error && <p className="muted" role="status">Loading…</p>}
      {data && data.length === 0 && <div className="empty">{which === "open" ? "No open disputes. 🎉" : "No resolved disputes yet."}</div>}
      {data?.map((d) => (
        <section key={d.id} className="card glass">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
            <h2 style={{ fontSize: 18 }}>#M-{d.publicId} · {d.title}{d.quantity > 1 ? ` ×${d.quantity}` : ""}</h2>
            <strong>{naira(d.amount)}</strong>
          </div>
          <div className="form-error" role="note"><strong>Buyer&apos;s complaint ({when(d.openedAt)}):</strong> {d.reason}</div>
          <dl className="ap-facts">
            <dt>Seller&apos;s proof</dt><dd>{d.deliveryProof ? <span className="ap-code" style={{ whiteSpace: "pre-wrap" }}>{d.deliveryProof}</span> : <span className="muted">None given</span>}</dd>
            <dt>Buyer</dt><dd>{d.buyer.name}<br /><span className="muted">{d.buyer.email}{d.buyer.phone ? ` · ${d.buyer.phone}` : ""}</span></dd>
            <dt>Seller</dt><dd>{d.seller.name}<br /><span className="muted">{d.seller.email}{d.seller.phone ? ` · ${d.seller.phone}` : ""}</span></dd>
          </dl>
          <details>
            <summary className="ap-link" style={{ cursor: "pointer" }}>What happened ({d.timeline.length} steps{d.messages.length ? `, ${d.messages.length} messages` : ""})</summary>
            <ul className="vc-history">
              {d.timeline.map((e, i) => <li key={i}><div><strong>{e.by}</strong>: {ACTION[e.action] ?? e.action} <span className="muted" style={{ fontSize: 13 }}>{when(e.at)}</span></div>{e.note && <div className="muted" style={{ fontSize: 13 }}>“{e.note}”</div>}</li>)}
              {d.messages.map((m, i) => <li key={`m${i}`}><div><strong>{m.by}</strong> wrote <span className="muted" style={{ fontSize: 13 }}>{when(m.at)}</span></div><div style={{ fontSize: 14 }}>{m.body}</div></li>)}
            </ul>
          </details>
          {d.status === "DISPUTED" ? (
            <>
              <div className="field">
                <label htmlFor={`dn-${d.id}`} className="muted" style={{ fontSize: 13 }}>Decision note (optional, kept on the trade)</label>
                <input id={`dn-${d.id}`} className="input" value={notes[d.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))} placeholder="e.g. Seller's waybill confirmed delivery" />
              </div>
              <p className="muted" style={{ fontSize: 13 }}>Contact both sides first if you need to. Then:</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-primary" disabled={busy === d.id} onClick={() => void resolve(d, "RESOLVE_BUYER")}>Refund buyer</button>
                <button type="button" className="btn btn-ghost" disabled={busy === d.id} onClick={() => void resolve(d, "RESOLVE_SELLER")}>Pay seller</button>
              </div>
            </>
          ) : (
            <div className="form-ok" role="status">{d.resolution === "refund_buyer" ? "Buyer refunded" : "Seller paid"} · {when(d.resolvedAt)}</div>
          )}
        </section>
      ))}
    </>
  );
}
