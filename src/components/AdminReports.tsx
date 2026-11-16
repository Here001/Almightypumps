"use client";

import { useCallback, useEffect, useState } from "react";
import { api, naira } from "./api";

type Report = {
  id: string; publicId: number; reason: string; details: string | null; status: "open" | "closed"; adminNote: string | null; createdAt: string; closedAt: string | null;
  tradeId: string; tradePublicId: number; tradeStatus: string; amount: number; title: string;
  reporterId: string; reporterName: string; reporterEmail: string;
  sellerId: string; sellerName: string; sellerEmail: string; shop: string | null; sellerSuspended: string | null; sellerReports: number;
};

const when = (d: string | null) => (d ? new Date(d).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }) : "");
const TRADE: Record<string, string> = { PAID: "Paid, not delivered", SHIPPED: "Delivered, buyer checking", DISPUTED: "In dispute", COMPLETED: "Completed", CANCELLED: "Cancelled", REFUNDED: "Refunded" };

/** Buyers' reports about sellers: read, look at the seller, then mark as handled. */
export function AdminReports() {
  const [which, setWhich] = useState<"open" | "closed">("open");
  const [data, setData] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    try { setData(await api<Report[]>(`/api/admin/reports?status=${which}`)); setError(null); } catch (e) { setError((e as Error).message); }
  }, [which]);
  useEffect(() => { setData(null); void load(); }, [load]);

  async function go(r: Report, action: "close" | "reopen") {
    setBusy(r.id); setMsg(null);
    try {
      await api(`/api/admin/reports/${r.id}`, { action, note: notes[r.id]?.trim() || undefined });
      setMsg({ ok: true, text: action === "close" ? `Report #R-${r.publicId} marked as handled.` : `Report #R-${r.publicId} reopened.` });
      await load();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  return (
    <section className="card glass">
      <h2>{which === "open" ? "Reports to look at" : "Handled reports"}</h2>
      <div className="ap-chips" role="group" aria-label="Status">
        <button type="button" className="ap-chip" aria-pressed={which === "open"} onClick={() => { setWhich("open"); setMsg(null); }}>To look at</button>
        <button type="button" className="ap-chip" aria-pressed={which === "closed"} onClick={() => { setWhich("closed"); setMsg(null); }}>Handled</button>
      </div>
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}
      {!data && !error && <p className="muted" role="status">Loading…</p>}
      {data && data.length === 0 && <div className="empty">{which === "open" ? "No reports to look at." : "No handled reports yet."}</div>}
      {data && data.length > 0 && (
        <ul className="ap-list">
          {data.map((r) => (
            <li key={r.id} className="ap-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="ap-row-title" style={{ fontWeight: 600 }}>{r.reason}</div>
                  <div className="muted ap-row-sub">#R-{r.publicId} · {when(r.createdAt)} · order #M-{r.tradePublicId} “{r.title}” ({naira(r.amount)}, {TRADE[r.tradeStatus] ?? r.tradeStatus})</div>
                </div>
                {r.sellerReports > 1 && <span className="status bad">{r.sellerReports} reports on this seller</span>}
              </div>
              {r.details && <div className="selectable" style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>“{r.details}”</div>}
              <dl className="ap-facts">
                <dt>Seller</dt><dd><a className="ap-link" href={`/admin/users/${r.sellerId}`}>{r.shop || r.sellerName}</a>{r.sellerSuspended ? " (suspended)" : ""}<br /><span className="muted selectable">{r.sellerEmail}</span></dd>
                <dt>Reported by</dt><dd><a className="ap-link" href={`/admin/users/${r.reporterId}`}>{r.reporterName}</a><br /><span className="muted selectable">{r.reporterEmail}</span></dd>
                {r.adminNote && <><dt>Your note</dt><dd>{r.adminNote}</dd></>}
              </dl>
              {r.status === "open" ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div className="field" style={{ flex: "1 1 220px", margin: 0 }}>
                    <label htmlFor={`rn-${r.id}`} className="muted" style={{ fontSize: 13 }}>What you did (optional)</label>
                    <input id={`rn-${r.id}`} className="input" value={notes[r.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} placeholder="e.g. Warned the seller / suspended them" />
                  </div>
                  <button type="button" className="btn btn-primary ap-mini" disabled={busy === r.id} onClick={() => void go(r, "close")}>Mark as handled</button>
                </div>
              ) : (
                <div><span className="muted" style={{ fontSize: 13 }}>Handled {when(r.closedAt)}</span> <button type="button" className="btn btn-ghost ap-mini" disabled={busy === r.id} onClick={() => void go(r, "reopen")}>Reopen</button></div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>To stop a seller selling, open their customer page and tap Suspend. To pause one ad, use Ads to review.</p>
    </section>
  );
}
