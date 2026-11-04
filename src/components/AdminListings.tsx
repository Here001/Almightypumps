"use client";

import { useEffect, useState } from "react";
import { api, naira } from "./api";
import { AdGallery } from "./dashboard/Marketplace";

type Item = {
  id: string; title: string; description: string; category: string; price: number; stock: number;
  reviewNote: string | null; createdAt: string; sellerName: string; sellerEmail: string; images: string[];
};

export function AdminListings() {
  const [status, setStatus] = useState<"pending" | "declined">("pending");
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setItems(null);
    api<Item[]>(`/api/admin/listings?status=${status}`).then(setItems).catch((e) => setError((e as Error).message));
  }, [status]);

  async function decide(it: Item, decision: "approve" | "decline") {
    setBusy(it.id);
    setNotice(null);
    try {
      await api(`/api/admin/listings/${it.id}`, { decision, note: notes[it.id] });
      setItems((prev) => prev?.filter((x) => x.id !== it.id) ?? null);
      setNotice(decision === "approve" ? `Approved: “${it.title}” is now live.` : `Declined: “${it.title}”.`);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card glass">
      <div className="ap-chips ap-chips-wrap" role="group" aria-label="Show">
        <button type="button" className="ap-chip" aria-pressed={status === "pending"} onClick={() => setStatus("pending")}>Waiting for review</button>
        <button type="button" className="ap-chip" aria-pressed={status === "declined"} onClick={() => setStatus("declined")}>Declined</button>
      </div>
      {notice && <div className="form-ok" role="status">{notice}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}
      {!items && !error && <p className="muted" role="status">Loading…</p>}
      {items && items.length === 0 && <div className="empty">{status === "pending" ? "Nothing waiting. All caught up." : "No declined listings."}</div>}
      <ul className="ap-list">
        {items?.map((it) => (
          <li key={it.id} className="ap-row" style={{ flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div className="ap-row-title" style={{ fontWeight: 700 }}>{it.title}</div>
                <div className="muted ap-row-sub">{it.category} · stock {it.stock} · by {it.sellerName} ({it.sellerEmail}) · {new Date(it.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })}</div>
              </div>
              <strong>{naira(it.price)}</strong>
            </div>
            {it.images?.length > 0 && <AdGallery images={it.images} title={it.title} />}
            <p style={{ fontSize: 14, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{it.description}</p>
            {it.reviewNote && <div className="muted ap-row-sub">Why: {it.reviewNote}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                className="input" style={{ flex: "1 1 220px", minHeight: 40 }} placeholder="Reason if declining (seller sees this)"
                value={notes[it.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [it.id]: e.target.value }))} aria-label="Decline reason"
              />
              <button type="button" className="btn btn-primary ap-mini" disabled={busy === it.id} onClick={() => void decide(it, "approve")}>Approve</button>
              {status === "pending" && <button type="button" className="btn btn-ghost ap-mini" disabled={busy === it.id} onClick={() => void decide(it, "decline")}>Decline</button>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
