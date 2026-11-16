"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../api";
import { useCurrency } from "./Currency";

export type Offer = {
  id: string; publicId: number; listingId: string; title: string; quantity: number; unitPrice: number; counterPrice: number | null;
  total: number; status: "pending" | "countered" | "accepted" | "declined" | "withdrawn" | "expired"; note: string | null;
  tradeId: string | null; expiresAt: string | null; createdAt: string; other: string | null;
};
type Lists = { asBuyer: Offer[]; asSeller: Offer[] };

const STATUS: Record<Offer["status"], { label: string; tone: string }> = {
  pending: { label: "Waiting for seller", tone: "info" }, countered: { label: "Counter-offer", tone: "warn" }, accepted: { label: "Accepted", tone: "ok" },
  declined: { label: "Declined", tone: "bad" }, withdrawn: { label: "Withdrawn", tone: "" }, expired: { label: "Expired", tone: "" },
};

function left(iso: string | null) {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expiring now";
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
  return h >= 1 ? `${h}h ${m}m left` : `${m}m left`;
}

function useOffers() {
  const [lists, setLists] = useState<Lists | null>(null);
  const load = useCallback(() => api<Lists>("/api/market/offers").then(setLists).catch(() => setLists({ asBuyer: [], asSeller: [] })), []);
  useEffect(() => {
    void load();
    const again = () => void load();
    window.addEventListener("ap:offers", again);
    return () => window.removeEventListener("ap:offers", again);
  }, [load]);
  return { lists, load };
}

async function send(id: string, action: string, price?: string) {
  return api<{ status: string; tradeId: string | null }>(`/api/market/offers/${id}`, price ? { action, price } : { action });
}

/** Seller panel: offers on my negotiable ads. Accept, decline or counter. */
export function SellerOffers({ onChanged }: { onChanged: () => Promise<void> | void }) {
  const { lists, load } = useOffers();
  const { charge } = useCurrency();
  const [busy, setBusy] = useState<string | null>(null);
  const [counter, setCounter] = useState<{ id: string; price: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const open = lists?.asSeller.filter((o) => o.status === "pending" || o.status === "countered") ?? [];
  const recent = lists?.asSeller.filter((o) => o.status !== "pending" && o.status !== "countered").slice(0, 5) ?? [];
  if (!lists || (open.length === 0 && recent.length === 0)) return null;

  async function go(o: Offer, action: "accept" | "decline" | "counter", price?: string) {
    if (action === "decline" && !window.confirm("Decline this offer? The buyer's money goes back to them.")) return;
    setBusy(o.id); setMsg(null);
    try {
      await send(o.id, action, price);
      setCounter(null);
      setMsg({ ok: true, text: action === "accept" ? `Offer accepted. It's now order for ${o.quantity} × “${o.title}”: deliver within 72 hours.` : action === "counter" ? "Counter-offer sent. The buyer has 24 hours to accept it." : "Offer declined." });
      await load(); await onChanged();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  return (
    <section className="card glass">
      <h2>Offers on your ads</h2>
      {open.length === 0 ? <p className="muted" style={{ fontSize: 14 }}>No offers waiting.</p> : (
        <ul className="ap-list">
          {open.map((o) => (
            <li key={o.id} className="ap-row" style={{ flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="ap-row-title" style={{ fontWeight: 600 }}>{o.title} × {o.quantity}</div>
                  <div className="muted ap-row-sub">From {o.other ?? "a buyer"} · {left(o.expiresAt)}{o.status === "countered" && o.counterPrice ? ` · you asked ${charge(o.counterPrice)} each` : ""}</div>
                  {o.note && <div className="ap-row-sub" style={{ marginTop: 4 }}>“{o.note}”</div>}
                </div>
                <div className="ap-row-end"><strong>{charge(o.unitPrice)}</strong><span className="muted ap-row-sub">each · {charge(o.total)} held</span></div>
              </div>
              {o.status === "countered" ? <span className={`status ${STATUS.countered.tone}`}>Waiting for the buyer to answer your counter-offer</span> : counter?.id === o.id ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div className="field" style={{ flex: "1 1 160px" }}>
                    <label htmlFor={`ctr-${o.id}`}>Your price each (₦)</label>
                    <input id={`ctr-${o.id}`} className="input" inputMode="decimal" value={counter.price} onChange={(e) => setCounter({ id: o.id, price: e.target.value })} autoFocus />
                  </div>
                  <button type="button" className="btn btn-primary ap-mini" disabled={busy === o.id || !counter.price.trim()} onClick={() => void go(o, "counter", counter.price)}>Send counter-offer</button>
                  <button type="button" className="btn btn-ghost ap-mini" onClick={() => setCounter(null)}>Back</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-primary ap-mini" disabled={busy === o.id} onClick={() => void go(o, "accept")}>Accept {charge(o.total)}</button>
                  <button type="button" className="btn btn-ghost ap-mini" disabled={busy === o.id} onClick={() => setCounter({ id: o.id, price: "" })}>Counter-offer</button>
                  <button type="button" className="btn btn-ghost ap-mini" disabled={busy === o.id} onClick={() => void go(o, "decline")}>Decline</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {recent.length > 0 && (
        <details>
          <summary className="muted" style={{ fontSize: 13, cursor: "pointer" }}>Recent answered offers</summary>
          <ul className="ap-list">
            {recent.map((o) => (
              <li key={o.id} className="ap-row">
                <div style={{ minWidth: 0 }}><div className="ap-row-title">{o.title} × {o.quantity}</div><div className="muted ap-row-sub">{o.other ?? "Buyer"} · {charge(o.unitPrice)} each</div></div>
                <span className={`status ${STATUS[o.status].tone}`}>{STATUS[o.status].label}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role="status">{msg.text}</div>}
    </section>
  );
}

/** P2P tab: offers I made. Accept or decline a counter-offer, or withdraw. */
export function BuyerOffers({ balance }: { balance: number }) {
  const router = useRouter();
  const { lists, load } = useOffers();
  const { charge } = useCurrency();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const mine = lists?.asBuyer.slice(0, 12) ?? [];
  if (!lists || mine.length === 0) return null;

  async function go(o: Offer, action: "withdraw" | "accept_counter" | "decline_counter") {
    if (action === "withdraw" && !window.confirm("Withdraw this offer? Your held money comes back to your wallet.")) return;
    setBusy(o.id); setMsg(null);
    try {
      await send(o.id, action);
      setMsg({ ok: true, text: action === "accept_counter" ? "Deal agreed. Your money is in escrow and the seller has 72 hours to deliver. Follow it under My trades." : action === "withdraw" ? "Offer withdrawn. Your money is back in your wallet." : "Counter-offer declined. Your money is back in your wallet." });
      await load(); router.refresh();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  return (
    <section className="card glass" id="my-offers">
      <h2>My offers</h2>
      <ul className="ap-list">
        {mine.map((o) => {
          const extra = o.counterPrice ? (o.counterPrice - o.unitPrice) * o.quantity : 0;
          return (
            <li key={o.id} className="ap-row" style={{ flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="ap-row-title" style={{ fontWeight: 600 }}>{o.title} × {o.quantity}</div>
                  <div className="muted ap-row-sub">{o.other ?? "Seller"} · you offered {charge(o.unitPrice)} each{o.expiresAt ? ` · ${left(o.expiresAt)}` : ""}</div>
                </div>
                <span className={`status ${STATUS[o.status].tone}`}>{STATUS[o.status].label}</span>
              </div>
              {o.status === "countered" && o.counterPrice && (
                <>
                  <div className="ap-row-sub">The seller asks <strong>{charge(o.counterPrice)}</strong> each ({charge(o.counterPrice * o.quantity)} in total).{extra > balance ? ` You need ${charge(extra - balance)} more in your wallet to accept.` : ""}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="btn btn-primary ap-mini" disabled={busy === o.id} onClick={() => void go(o, "accept_counter")}>Accept {charge(o.counterPrice * o.quantity)}</button>
                    <button type="button" className="btn btn-ghost ap-mini" disabled={busy === o.id} onClick={() => void go(o, "decline_counter")}>Decline</button>
                  </div>
                </>
              )}
              {o.status === "pending" && (
                <div><button type="button" className="btn btn-ghost ap-mini" disabled={busy === o.id} onClick={() => void go(o, "withdraw")}>Withdraw offer</button></div>
              )}
            </li>
          );
        })}
      </ul>
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role="status">{msg.text}</div>}
    </section>
  );
}
