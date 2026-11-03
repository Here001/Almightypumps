"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

type App = {
  userId: string; name: string; email: string; businessName: string; contactPhone: string; bankName: string;
  accountNumber: string; accountName: string; idType: string; idNumber: string; whatTheySell: string;
  reviewNote: string | null; submittedAt: string; decidedAt: string | null;
};
const ID_LABEL: Record<string, string> = { nin: "NIN", drivers_license: "Driver's licence", passport: "Passport", voters_card: "Voter's card" };
const when = (d: string | null) => (d ? new Date(d).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }) : "");

export function AdminSellers() {
  const [status, setStatus] = useState<"pending" | "verified" | "rejected">("pending");
  const [items, setItems] = useState<App[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setItems(null);
    api<App[]>(`/api/admin/sellers?status=${status}`).then(setItems).catch((e) => setError((e as Error).message));
  }, [status]);

  async function decide(a: App, decision: "verified" | "rejected") {
    setBusy(a.userId);
    setNotice(null);
    try {
      await api(`/api/admin/sellers/${a.userId}`, { decision, note: notes[a.userId] });
      setItems((p) => p?.filter((x) => x.userId !== a.userId) ?? null);
      setNotice({ ok: true, text: decision === "verified" ? `${a.businessName} is now a verified seller.` : `${a.businessName} was rejected; they can fix and re-apply.` });
    } catch (e) {
      setNotice({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card glass">
      <div className="ap-chips ap-chips-wrap" role="group" aria-label="Status">
        {(["pending", "verified", "rejected"] as const).map((s) => (
          <button key={s} type="button" className="ap-chip" aria-pressed={status === s} onClick={() => setStatus(s)}>
            {s === "pending" ? "Waiting for review" : s === "verified" ? "Verified" : "Rejected"}
          </button>
        ))}
      </div>
      {notice && <div className={notice.ok ? "form-ok" : "form-error"} role={notice.ok ? "status" : "alert"}>{notice.text}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}
      {!items && !error && <p className="muted" role="status">Loading…</p>}
      {items && items.length === 0 && <div className="empty">{status === "pending" ? "No applications waiting." : "Nothing here yet."}</div>}
      <ul className="ap-list">
        {items?.map((a) => (
          <li key={a.userId} className="ap-row" style={{ flexDirection: "column", gap: 10 }}>
            <div>
              <div className="ap-row-title" style={{ fontWeight: 700 }}>{a.businessName}</div>
              <div className="muted ap-row-sub">{a.name} · {a.email} · {a.contactPhone} · applied {when(a.submittedAt)}</div>
            </div>
            <dl className="ap-facts">
              <dt>Sells</dt><dd>{a.whatTheySell}</dd>
              <dt>ID</dt><dd><b>{ID_LABEL[a.idType] ?? a.idType}</b> <span style={{ fontFamily: "var(--mono)" }}>{a.idNumber}</span></dd>
              <dt>Payout</dt><dd>{a.bankName} · <span style={{ fontFamily: "var(--mono)" }}>{a.accountNumber}</span> · {a.accountName}</dd>
              {a.accountName.trim().toLowerCase() !== a.name.trim().toLowerCase() && (
                <><dt>Check</dt><dd style={{ color: "var(--warn)" }}>Account name differs from the account holder&apos;s name ({a.name}).</dd></>
              )}
              {a.reviewNote && <><dt>Reason</dt><dd>{a.reviewNote}</dd></>}
            </dl>
            {status !== "verified" && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input className="input" style={{ flex: "1 1 220px", minHeight: 40 }} placeholder="Reason if rejecting (applicant sees this)"
                  value={notes[a.userId] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [a.userId]: e.target.value }))} aria-label="Rejection reason" />
                <button type="button" className="btn btn-primary ap-mini" disabled={busy === a.userId} onClick={() => void decide(a, "verified")}>Approve</button>
                {status === "pending" && <button type="button" className="btn btn-ghost ap-mini" disabled={busy === a.userId} onClick={() => void decide(a, "rejected")}>Reject</button>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
