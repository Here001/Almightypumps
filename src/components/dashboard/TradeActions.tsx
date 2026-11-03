"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../api";

type T = { uuid: string; id: number; role: string; status: string; shipBy: string; inspectionEndsAt: string | null; proof: string | null };

const left = (iso: string) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
  return h >= 1 ? `${h}h ${m}m` : `${m}m`;
};

/** What a buyer can do on their trade: confirm, dispute, or cancel if the seller missed the deadline. */
export function TradeActions({ t }: { t: T }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [disputing, setDisputing] = useState(false);
  const [note, setNote] = useState("");
  if (t.role !== "Buying") return null;

  async function act(action: "CONFIRM" | "DISPUTE" | "CANCEL", extra: Record<string, string> = {}) {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/market/trades/${t.uuid}/action`, { action, ...extra });
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (t.status === "PAID") {
    const l = left(t.shipBy);
    return (
      <div className="muted ap-row-sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {l ? <span>Waiting for the seller to deliver ({l} left).</span> : (
          <>
            <span>The seller missed the deadline.</span>
            <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => { if (window.confirm("Cancel and get your money back?")) void act("CANCEL"); }}>Cancel & refund</button>
          </>
        )}
        {err && <div className="form-error" role="alert">{err}</div>}
      </div>
    );
  }
  if (t.status !== "SHIPPED") return null;
  const l = t.inspectionEndsAt ? left(t.inspectionEndsAt) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {t.proof && <div className="ap-code" style={{ fontSize: 14 }}>{t.proof}</div>}
      <span className="muted ap-row-sub">Check what you received.{l ? ` The seller is paid automatically in ${l} unless you confirm or open a dispute.` : ""}</span>
      {!disputing ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="mk-buy" disabled={busy} onClick={() => { if (window.confirm("Confirm you received it as described? This releases the money to the seller.")) void act("CONFIRM"); }}>Confirm received</button>
          <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => setDisputing(true)}>Something&apos;s wrong</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tell our team what's wrong. The money stays in escrow while we look into it." aria-label="What's wrong" />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-primary ap-mini" disabled={busy || note.trim().length < 5} onClick={() => void act("DISPUTE", { note: note.trim() })}>Open dispute</button>
            <button type="button" className="btn btn-ghost ap-mini" onClick={() => setDisputing(false)}>Back</button>
          </div>
        </div>
      )}
      {err && <div className="form-error" role="alert">{err}</div>}
    </div>
  );
}
