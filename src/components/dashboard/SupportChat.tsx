"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Sheet } from "./instantUi";

type Msg = { id: string; from: "customer" | "admin"; body: string; at: string; by: string | null };
type Conv = { messages: Msg[]; status: "open" | "closed" };

const time = (d: string) => new Date(d).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Floating "Help" button + chat with Almighty Pumps support. Opens by itself for links ending in #support. */
export function SupportChat() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const [conv, setConv] = useState<Conv | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  // Little dot when support has replied (checked every minute while closed).
  useEffect(() => {
    if (open) return;
    const peek = () => api<{ unread: boolean }>("/api/support?peek=1").then((r) => setUnread(r.unread)).catch(() => {});
    void peek();
    const t = setInterval(() => { if (document.visibilityState === "visible") void peek(); }, 60_000);
    return () => clearInterval(t);
  }, [open]);

  // #support in the address (from the reply email) opens the chat.
  useEffect(() => {
    const check = () => { if (window.location.hash === "#support") { setOpen(true); history.replaceState(null, "", window.location.pathname + "#services"); } };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);

  const load = useCallback(() => api<Conv>("/api/support").then((c) => { setConv(c); setUnread(false); }).catch((e) => setErr((e as Error).message)), []);
  useEffect(() => {
    if (!open) return;
    void load();
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 8000);
    return () => clearInterval(t);
  }, [open, load]);
  const count = conv?.messages.length ?? 0;
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [count, open]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setBusy(true); setErr(null);
    try { await api("/api/support", { body }); setText(""); await load(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <button type="button" className="sup-fab" onClick={() => setOpen(true)} aria-label={unread ? "Help and support (new reply)" : "Help and support"}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
        <span className="sup-fab-label">Help</span>
        {unread && <span className="sup-dot" aria-hidden="true" />}
      </button>
      {open && (
        <Sheet title="Chat with support" kicker="Almighty Pumps" onClose={() => setOpen(false)}>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Ask about an order, a payment or anything else. We usually reply within a few hours, and we&apos;ll email you when we do. Never share your password or card details.</p>
          <div className="tr-msgs sup-msgs" aria-live="polite">
            {!conv ? <p className="muted" role="status">Loading…</p> : conv.messages.length === 0 ? (
              <p className="muted" style={{ fontSize: 14, margin: 0 }}>Hi! How can we help? Tell us what you need and include an order number if you have one.</p>
            ) : conv.messages.map((m) => (
              <div key={m.id} className={`tr-msg${m.from === "customer" ? " mine" : ""}`}>
                <span className="tr-msg-body selectable">{m.body}</span>
                <span className="tr-msg-meta">{m.from === "customer" ? "You" : `${m.by ?? "Support"} · Almighty Pumps`} · {time(m.at)}</span>
              </div>
            ))}
            <div ref={end} />
          </div>
          <form className="tr-send" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your message" maxLength={2000} aria-label="Message"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(min-width: 900px)").matches) { e.preventDefault(); void send(); } }} />
            <button className="btn btn-primary ap-mini" disabled={busy || !text.trim()}>{busy ? "Sending…" : "Send"}</button>
          </form>
          {err && <div className="form-error" role="alert">{err}</div>}
        </Sheet>
      )}
    </>
  );
}
