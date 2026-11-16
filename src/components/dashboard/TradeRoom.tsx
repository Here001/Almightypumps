"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useCurrency } from "./Currency";
import { Sheet } from "./instantUi";
import { AdGallery } from "./Marketplace";

type Status = "PAID" | "SHIPPED" | "DISPUTED" | "COMPLETED" | "CANCELLED" | "REFUNDED";
type Room = {
  trade: { id: string; publicId: number; quantity: number; amount: number; status: Status; shipBy: string; shippedAt: string | null; inspectionEndsAt: string | null; closedAt: string | null; deliveryProof: string | null; createdAt: string; buyerId: string; sellerId: string;
    cancelStatus: "pending" | "accepted" | "rejected" | "expired" | "closed" | null; cancelReason: string | null };
  events: { id: string; action: string; note: string | null; createdAt: string }[];
  messages: { id: string; senderId: string; body: string; createdAt: string }[];
  listing: { title: string; deliveryType: string; images: string[] };
  buyerName: string; sellerName: string; role: "buyer" | "seller" | "admin"; sellerReceives: number;
  reported?: boolean; cancelAnswerBy?: string | null;
};

// Same list as REPORT_REASONS in src/server/market.ts.
const REPORT_REASONS = [
  "Asked me to pay or talk outside Almighty Pumps",
  "Scam or fraud attempt",
  "Item is fake or not as described",
  "Rude, threatening or abusive",
  "Something else",
];

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
  REQUEST_CANCEL: "Buyer asked to cancel", CANCEL_AGREED: "Seller agreed to cancel. Buyer refunded",
  ESCALATE: "Cancellation not agreed. Sent to our team as a dispute",
};
const SHOW_NOTE = new Set(["DISPUTE", "REQUEST_CANCEL", "ESCALATE"]);

/** The trade room: progress steps, live countdown, actions for the buyer or seller, and the chat. */
export function TradeRoom({ tradeId, myId, focus, onClose, onChanged }: { tradeId: string; myId?: string; focus?: "chat"; onClose: () => void; onChanged: () => void }) {
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
      <CancelRequest room={room} />

      {t.deliveryProof && (
        <div className="field">
          <span style={{ fontWeight: 600, fontSize: 14 }}>Delivery details from the seller</span>
          <div className="ap-code" style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{t.deliveryProof}</div>
        </div>
      )}

      <RoomActions room={room} onDone={async () => { await load(); onChanged(); }} />

      {room.listing.images.length > 0 && <AdGallery images={room.listing.images} title={room.listing.title} />}

      <Chat room={room} focus={focus === "chat"} myId={room.role === "buyer" ? t.buyerId : room.role === "seller" ? t.sellerId : (myId ?? "")} other={other} onSent={load} />

      <details className="tr-timeline">
        <summary>Timeline</summary>
        <ul>{room.events.map((e) => <li key={e.id}><span className="muted">{when(e.createdAt)}</span> {EVENT_TEXT[e.action] ?? e.action}{e.note && SHOW_NOTE.has(e.action) ? `: “${e.note}”` : ""}</li>)}</ul>
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

function CancelRequest({ room }: { room: Room }) {
  const t = room.trade;
  const left = useCountdown(room.cancelAnswerBy ?? null);
  if (t.cancelStatus !== "pending" || (t.status !== "PAID" && t.status !== "SHIPPED")) return null;
  const buyer = room.role === "buyer";
  return (
    <div className="tr-status warn" role="status">
      <b>{buyer ? "You asked to cancel this order." : `${room.buyerName} wants to cancel this order.`}</b>
      {t.cancelReason && <span className="tr-quote selectable">“{t.cancelReason}”</span>}
      <span>{buyer
        ? <>Waiting for the seller to answer{left ? <> (<b className="tr-clock">{left}</b> left)</> : ""}. If they agree, your money comes straight back. If they refuse or don&apos;t answer, our team decides.</>
        : <>Accept to refund the buyer, or refuse and our team will review it as a dispute.{left ? <> If you don&apos;t answer in <b className="tr-clock">{left}</b>, it goes to dispute.</> : ""}</>}</span>
    </div>
  );
}

type Mode = "" | "dispute" | "ship" | "cancel" | "refuse" | "report";

function RoomActions({ room, onDone }: { room: Room; onDone: () => Promise<void> }) {
  const t = room.trade;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("");
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (mode) panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [mode]);
  async function act(action: string, extra: Record<string, string> = {}, done?: string) {
    setBusy(true); setErr(null); setOk(null);
    try { await api(`/api/market/trades/${t.id}/action`, { action, ...extra }); setMode(""); setText(""); setReason(""); if (done) setOk(done); await onDone(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  const open = t.status === "PAID" || t.status === "SHIPPED";
  const late = t.status === "PAID" && new Date(t.shipBy).getTime() <= Date.now();
  const pending = t.cancelStatus === "pending";
  const inspectionOver = t.status === "SHIPPED" && t.inspectionEndsAt !== null && new Date(t.inspectionEndsAt).getTime() <= Date.now();
  const main: React.ReactNode[] = [];
  const more: React.ReactNode[] = [];
  const pick = (m: Mode) => () => { setMode(m); setErr(null); setOk(null); setText(""); setReason(""); };

  if (room.role === "buyer") {
    if (t.status === "SHIPPED") {
      main.push(<button key="c" type="button" className="mk-buy" disabled={busy} onClick={() => { if (window.confirm("Confirm you received it as described? This pays the seller.")) void act("CONFIRM"); }}>Confirm received</button>);
    }
    if (late) {
      main.push(<button key="x" type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => { if (window.confirm("The seller missed the deadline. Cancel and get your money back now?")) void act("CANCEL"); }}>Cancel & refund</button>);
    } else if (open && !pending && t.cancelStatus !== "rejected" && t.cancelStatus !== "expired") {
      more.push(<button key="rc" type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={pick("cancel")}>Cancel order</button>);
    }
    if (open && !inspectionOver) more.push(<button key="d" type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={pick("dispute")}>Raise dispute</button>);
    if (!room.reported) more.push(<button key="rp" type="button" className="btn btn-ghost ap-mini tr-report" disabled={busy} onClick={pick("report")}>Report seller</button>);
  }
  if (room.role === "seller" && open && pending) {
    main.push(<button key="ac" type="button" className="mk-buy" disabled={busy} onClick={() => { if (window.confirm("Accept the cancellation? The buyer gets their money back and this order ends.")) void act("ACCEPT_CANCEL", {}, "Order cancelled. The buyer has been refunded."); }}>Accept cancellation</button>);
    main.push(<button key="rj" type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={pick("refuse")}>Refuse</button>);
  } else if (room.role === "seller" && t.status === "PAID") {
    main.push(<button key="s" type="button" className="mk-buy" disabled={busy} onClick={pick("ship")}>Mark as delivered</button>);
    main.push(<button key="r" type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => { if (window.confirm("Cancel this order and refund the buyer?")) void act("CANCEL"); }}>Can&apos;t deliver: refund</button>);
  }
  if (!main.length && !more.length && !ok) return null;

  const form: Record<Exclude<Mode, "">, { label: string; hint: string; min: number; button: string; send: () => void }> = {
    ship: { label: "Delivery details", hint: "Delivery details for the buyer: the code, a download link, or tracking/pick-up details.", min: 3, button: "Send & mark delivered",
      send: () => void act("SHIP", { deliveryProof: text.trim() }) },
    dispute: { label: "What's wrong", hint: "Tell our team what's wrong. The money stays in escrow while we look into it.", min: 5, button: "Raise dispute",
      send: () => void act("DISPUTE", { note: text.trim() }, "Dispute raised. Our team will look into it; your money stays in escrow.") },
    cancel: { label: "Why do you want to cancel?", hint: "E.g. I ordered the wrong item, the seller is taking too long… The seller sees this.", min: 5, button: "Send cancellation request",
      send: () => void act("REQUEST_CANCEL", { note: text.trim() }, "Cancellation request sent. If the seller agrees, your money comes straight back.") },
    refuse: { label: "Why are you refusing? (optional)", hint: "E.g. I already delivered it. Our team and the buyer will see this.", min: 0, button: "Refuse and send to dispute",
      send: () => void act("REJECT_CANCEL", { note: text.trim() }, "Refused. The order is now a dispute and our team will decide.") },
    report: { label: reason === "Something else" ? "What happened?" : "Anything else? (optional)", hint: "Only our team sees this report. It isn't shown to the seller.", min: reason === "Something else" ? 5 : 0, button: "Send report",
      send: () => void act("REPORT", { reason, note: text.trim() }, "Thanks. Your report went to our team. Your order and money are not affected.") },
  };
  const f = mode ? form[mode] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }} ref={panel}>
      {!f && main.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{main}</div>}
      {!f && more.length > 0 && <div className="tr-more" role="group" aria-label="Problem with this order?"><span className="muted">Problem with this order?</span>{more}</div>}
      {f && (
        <div className="tr-form">
          <strong>{mode === "cancel" ? "Ask the seller to cancel" : mode === "refuse" ? "Refuse the cancellation" : mode === "report" ? "Report this seller" : mode === "dispute" ? "Raise a dispute" : "Mark as delivered"}</strong>
          {mode === "cancel" && <p className="muted" style={{ margin: 0, fontSize: 13 }}>The seller can accept (you get a full refund) or refuse (our team reviews it as a dispute). They have 24 hours to answer.</p>}
          {mode === "report" && (
            <div className="tr-reasons" role="radiogroup" aria-label="Reason">
              {REPORT_REASONS.map((r) => (
                <label key={r} className={`tr-reason${reason === r ? " on" : ""}`}>
                  <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} />{r}
                </label>
              ))}
            </div>
          )}
          <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label={f.label} placeholder={f.hint} maxLength={1000} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary ap-mini" disabled={busy || text.trim().length < f.min || (mode === "report" && !reason)} onClick={f.send}>{f.button}</button>
            <button type="button" className="btn btn-ghost ap-mini" onClick={() => setMode("")}>Back</button>
          </div>
        </div>
      )}
      {ok && <div className="form-ok" role="status">{ok}</div>}
      {err && <div className="form-error" role="alert">{err}</div>}
    </div>
  );
}

function Chat({ room, myId, other, onSent, focus }: { room: Room; myId: string; other: string; onSent: () => Promise<void>; focus?: boolean }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const count = room.messages.length;
  // Opened with "Chat seller": jump straight to the chat and put the cursor in the message box.
  useEffect(() => {
    if (!focus) return;
    box.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const t = setTimeout(() => input.current?.focus({ preventScroll: true }), 350);
    return () => clearTimeout(t);
  }, [focus]);
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
    <section className="tr-chat" aria-label={`Chat with ${other}`} ref={box} style={{ scrollMarginTop: 12 }}>
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
          <input ref={input} className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" maxLength={2000} aria-label="Message" />
          <button className="btn btn-primary ap-mini" disabled={busy || !text.trim()}>Send</button>
        </form>
      )}
      {err && <div className="form-error" role="alert">{err}</div>}
    </section>
  );
}
