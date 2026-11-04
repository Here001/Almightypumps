"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useCurrency } from "./Currency";
import { Sheet } from "./instantUi";
import { AdGallery } from "./Marketplace";

type Status = "PAID" | "SHIPPED" | "DISPUTED" | "COMPLETED" | "CANCELLED" | "REFUNDED";
type Room = {
  trade: { id: string; publicId: number; quantity: number; amount: number; status: Status; shipBy: string; shippedAt: string | null; inspectionEndsAt: string | null; closedAt: string | null; deliveryProof: string | null; createdAt: string; buyerId: string; sellerId: string };
  events: { id: string; action: string; note: string | null; createdAt: string }[];
  messages: { id: string; senderId: string; body: string; createdAt: string }[];
  listing: { title: string; deliveryType: string; images: string[] };
  buyerName: string; sellerName: string; role: "buyer" | "seller" | "admin"; sellerReceives: number;
};

const when = (d: string) => new Date(d).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
const time = (d: string) => new Date(d).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });

/** Live countdown, e.g. "2d 4h 10m" or "14m 09s". */
function useCountdown(iso: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!iso) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [iso]);
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "";
  const d = Math.floor(ms / 86_400_000), h = Math.floor((ms % 86_400_000) / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m ${String(s).padStart(2, "0")}s`;
}

const EVENT_TEXT: Record<string, string> = {
  PAY: "Buyer paid into escrow", SHIP: "Seller marked it delivered", CONFIRM: "Buyer confirmed. Seller paid", DISPUTE: "Buyer opened a dispute",
  CANCEL: "Order cancelled and refunded", AUTO_RELEASE: "Inspection time ended. Seller paid automatically", AUTO_CANCEL: "Seller missed the deadline. Refunded automatically",
  RESOLVE_BUYER: "Our team refunded the buyer", RESOLVE_SELLER: "Our team paid the seller",
};

/** The trade room: progress steps, live countdown, actions for the buyer or seller, and the chat. */
export function TradeRoom({ tradeId, myId, onClose, onChanged }: { tradeId: string; myId?: string; onClose: () => void; onChanged: () => void }) {
  const { charge } = useCurrency();
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setRoom(await api<Room>(`/api/market/trades/${tradeId}/messages`)); setError(null); } catch (e) { setError((e as Error).message); }
  }, [tradeId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 8000);
    return () => clearInterval(t);
  }, [load]);

  const t = room?.trade;
  const countdown = useCountdown(t?.status === "PAID" ? t.shipBy : t?.status === "SHIPPED" ? t.inspectionEndsAt : null);

  if (!room || !t) {
    return <Sheet title="Trade room" onClose={onClose}>{error ? <div className="form-error" role="alert">{error}</div> : <p className="muted" role="status">Loading…</p>}</Sheet>;
  }

  const buyer = room.role === "buyer";
  const other = buyer ? room.sellerName : room.buyerName;
  const step = t.status === "PAID" ? 1 : t.status === "SHIPPED" || t.status === "DISPUTED" ? 2 : 3;
  const ended = t.status === "CANCELLED" || t.status === "REFUNDED";

  return (
    <Sheet title={room.listing.title} kicker={`Order #M-${t.publicId} · ${buyer ? `buying from ${room.sellerName}` : `selling to ${room.buyerName}`}`} onClose={onClose}>
      <div className="tr-summary">
        <div><span className="muted">Amount</span><strong>{charge(t.amount)}</strong></div>
        <div><span className="muted">Quantity</span><strong>{t.quantity}</strong></div>
        {!buyer && <div><span className="muted">You receive</span><strong>{charge(room.sellerReceives)}</strong></div>}
      </div>

      <ol className="tr-steps" aria-label="Progress">
        {["Paid into escrow", "Delivered", ended ? "Refunded" : "Completed"].map((label, i) => (
          <li key={label} className={i + 1 < step || (i + 1 === step && step === 3) ? "done" : i + 1 === step ? "now" : ""} aria-current={i + 1 === step ? "step" : undefined}>
            <span className="tr-dot" aria-hidden="true">{i + 1 < step || (step === 3 && i === 2) ? "✓" : i + 1}</span>{label}
          </li>
        ))}
      </ol>

      <Status room={room} countdown={countdown} />

      {t.deliveryProof && (
        <div className="field">
          <span style={{ fontWeight: 600, fontSize: 14 }}>Delivery details from the seller</span>
          <div className="ap-code" style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{t.deliveryProof}</div>
        </div>
      )}

      <RoomActions room={room} onDone={async () => { await load(); onChanged(); }} />

      {room.listing.images.length > 0 && <AdGallery images={room.listing.images} title={room.listing.title} />}

      <Chat room={room} myId={room.role === "buyer" ? t.buyerId : room.role === "seller" ? t.sellerId : (myId ?? "")} other={other} onSent={load} />

      <details className="tr-timeline">
        <summary>Timeline</summary>
        <ul>{room.events.map((e) => <li key={e.id}><span className="muted">{when(e.createdAt)}</span> {EVENT_TEXT[e.action] ?? e.action}{e.note && e.action === "DISPUTE" ? `: “${e.note}”` : ""}</li>)}</ul>
      </details>
    </Sheet>
  );
}

function Status({ room, countdown }: { room: Room; countdown: string | null }) {
  const t = room.trade;
  const buyer = room.role === "buyer";
  const box = (tone: string, text: React.ReactNode) => <div className={`tr-status ${tone}`} role="status">{text}</div>;
  switch (t.status) {
    case "PAID":
      return box("info", countdown
        ? <>{buyer ? "Waiting for the seller to deliver." : "Deliver this order, then tap “Mark as delivered”."} <b className="tr-clock">{countdown}</b> left.{buyer ? " If it isn't delivered in time, you can cancel for a full refund." : " After that the order is cancelled and the buyer refunded."}</>
        : <>The delivery deadline has passed.{buyer ? " You can cancel for a full refund." : " This order will be refunded to the buyer."}</>);
    case "SHIPPED":
      return box("info", buyer
        ? <>Check what you received. Confirm if it&apos;s as described, or tell us if something&apos;s wrong. {countdown && <>The seller is paid automatically in <b className="tr-clock">{countdown}</b>.</>}</>
        : <>The buyer is checking the order. {countdown && <>You&apos;re paid automatically in <b className="tr-clock">{countdown}</b> unless they raise a problem.</>}</>);
    case "DISPUTED": return box("warn", "Our team is looking into this order. The money stays safe in escrow until it's settled. Add anything useful in the chat.");
    case "COMPLETED": return box("ok", buyer ? "Done. The seller has been paid." : "Done. The money is in your wallet.");
    default: return box("", buyer ? "This order was cancelled and your money returned to your wallet." : "This order was cancelled and the buyer refunded.");
  }
}

function RoomActions({ room, onDone }: { room: Room; onDone: () => Promise<void> }) {
  const t = room.trade;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"" | "dispute" | "ship">("");
  const [text, setText] = useState("");
  async function act(action: string, extra: Record<string, string> = {}) {
    setBusy(true); setErr(null);
    try { await api(`/api/market/trades/${t.id}/action`, { action, ...extra }); setMode(""); setText(""); await onDone(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  const late = new Date(t.shipBy).getTime() <= Date.now();
  const buttons: React.ReactNode[] = [];
  if (room.role === "buyer" && t.status === "SHIPPED") {
    buttons.push(<button key="c" type="button" className="mk-buy" disabled={busy} onClick={() => { if (window.confirm("Confirm you received it as described? This pays the seller.")) void act("CONFIRM"); }}>Confirm received</button>);
    buttons.push(<button key="d" type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => setMode("dispute")}>Something&apos;s wrong</button>);
  }
  if (room.role === "buyer" && t.status === "PAID" && late) {
    buttons.push(<button key="x" type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => { if (window.confirm("Cancel and get your money back?")) void act("CANCEL"); }}>Cancel & refund</button>);
  }
  if (room.role === "seller" && t.status === "PAID") {
    buttons.push(<button key="s" type="button" className="mk-buy" disabled={busy} onClick={() => setMode("ship")}>Mark as delivered</button>);
    buttons.push(<button key="r" type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => { if (window.confirm("Cancel this order and refund the buyer?")) void act("CANCEL"); }}>Can&apos;t deliver: refund</button>);
  }
  if (!buttons.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {mode === "" && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{buttons}</div>}
      {mode !== "" && (
        <>
          <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label={mode === "ship" ? "Delivery details" : "What's wrong"}
            placeholder={mode === "ship" ? "Delivery details for the buyer: the code, a download link, or tracking/pick-up details." : "Tell our team what's wrong. The money stays in escrow while we look into it."} />
          <div style={{ display: "flex", gap: 8 }}>
            {mode === "ship"
              ? <button type="button" className="btn btn-primary ap-mini" disabled={busy || text.trim().length < 3} onClick={() => void act("SHIP", { deliveryProof: text.trim() })}>Send & mark delivered</button>
              : <button type="button" className="btn btn-primary ap-mini" disabled={busy || text.trim().length < 5} onClick={() => void act("DISPUTE", { note: text.trim() })}>Open dispute</button>}
            <button type="button" className="btn btn-ghost ap-mini" onClick={() => setMode("")}>Back</button>
          </div>
        </>
      )}
      {err && <div className="form-error" role="alert">{err}</div>}
    </div>
  );
}

function Chat({ room, myId, other, onSent }: { room: Room; myId: string; other: string; onSent: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const count = room.messages.length;
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [count]);
  async function send() {
    const body = text.trim();
    if (!body) return;
    setBusy(true); setErr(null);
    try { await api(`/api/market/trades/${room.trade.id}/messages`, { body }); setText(""); await onSent(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <section className="tr-chat" aria-label={`Chat with ${other}`}>
      <div className="tr-chat-head"><strong>Chat with {other}</strong><span className="muted">Our team can read this chat if there&apos;s a dispute.</span></div>
      <div className="tr-msgs" aria-live="polite">
        {count === 0 && <p className="muted" style={{ fontSize: 13, margin: 0 }}>No messages yet. Say hello or ask a question.</p>}
        {room.messages.map((m) => {
          const mine = m.senderId === myId;
          return (
            <div key={m.id} className={`tr-msg${mine ? " mine" : ""}`}>
              <span className="tr-msg-body selectable">{m.body}</span>
              <span className="tr-msg-meta">{mine ? "You" : other} · {time(m.createdAt)}</span>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <p className="tr-warn">Never pay or share passwords outside this chat. Money sent outside escrow can&apos;t be protected or refunded.</p>
      {room.role !== "admin" && (
        <form className="tr-send" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" maxLength={2000} aria-label="Message" />
          <button className="btn btn-primary ap-mini" disabled={busy || !text.trim()}>Send</button>
        </form>
      )}
      {err && <div className="form-error" role="alert">{err}</div>}
    </section>
  );
}
