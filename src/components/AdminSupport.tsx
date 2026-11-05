"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, naira } from "./api";

type Row = { id: string; status: "open" | "closed"; unread: boolean; lastAt: string; userId: string; name: string; email: string; last: string; lastFrom: string };
type Msg = { id: string; from: "customer" | "admin"; body: string; at: string; by: string | null };
type Conv = { id: string; status: "open" | "closed"; customer: { id: string; name: string; email: string; phone: string | null; createdAt: string; available: number; held: number } | null; messages: Msg[] };

const when = (d: string) => new Date(d).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Admin inbox: list of conversations (unread first) and the open conversation with a reply box. */
export function AdminSupport() {
  const [filter, setFilter] = useState<"open" | "closed" | "all">("open");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [conv, setConv] = useState<Conv | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const loadList = useCallback(() => api<Row[]>(`/api/admin/support?filter=${filter}&q=${encodeURIComponent(q)}`).then(setRows).catch((e) => setMsg({ ok: false, text: (e as Error).message })), [filter, q]);
  useEffect(() => { const t = setTimeout(() => void loadList(), q ? 300 : 0); return () => clearTimeout(t); }, [loadList, q]);
  useEffect(() => { const t = setInterval(() => { if (document.visibilityState === "visible") void loadList(); }, 20_000); return () => clearInterval(t); }, [loadList]);

  const loadConv = useCallback(async (id: string) => { try { setConv(await api<Conv>(`/api/admin/support/${id}`)); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } }, []);
  useEffect(() => {
    if (!openId) return;
    void loadConv(openId);
    const t = setInterval(() => { if (document.visibilityState === "visible") void loadConv(openId); }, 10_000);
    return () => clearInterval(t);
  }, [openId, loadConv]);
  const count = conv?.messages.length ?? 0;
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [count]);

  async function act(body: Record<string, unknown>, ok?: string) {
    if (!openId) return;
    setBusy(true); setMsg(null);
    try { await api(`/api/admin/support/${openId}`, body); if (ok) setMsg({ ok: true, text: ok }); setText(""); await Promise.all([loadConv(openId), loadList()]); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  if (openId) {
    return (
      <>
        <button type="button" className="ap-link" style={{ alignSelf: "flex-start" }} onClick={() => { setOpenId(null); setConv(null); setMsg(null); void loadList(); }}>← All conversations</button>
        {msg && <div className={msg.ok ? "form-ok" : "form-error"} role="status">{msg.text}</div>}
        {!conv ? <p className="muted" role="status">Loading…</p> : (
          <section className="card glass" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {conv.customer && (
              <div className="ap-list-head">
                <div>
                  <h2 style={{ margin: 0 }}>{conv.customer.name}</h2>
                  <span className="muted selectable" style={{ fontSize: 13 }}>{conv.customer.email}{conv.customer.phone ? ` · ${conv.customer.phone}` : ""} · wallet {naira(conv.customer.available)}{conv.customer.held ? ` (+${naira(conv.customer.held)} held)` : ""}</span>
                </div>
                <Link href={`/admin/users/${conv.customer.id}`} className="btn btn-ghost ap-mini">Customer page</Link>
              </div>
            )}
            <div className="tr-msgs sup-msgs" style={{ maxHeight: "55vh" }}>
              {conv.messages.map((m) => (
                <div key={m.id} className={`tr-msg${m.from === "admin" ? " mine" : ""}`}>
                  <span className="tr-msg-body selectable">{m.body}</span>
                  <span className="tr-msg-meta">{m.from === "admin" ? `${m.by ?? "Admin"}` : conv.customer?.name.split(" ")[0] ?? "Customer"} · {when(m.at)}</span>
                </div>
              ))}
              <div ref={end} />
            </div>
            <form className="tr-send" onSubmit={(e) => { e.preventDefault(); void act({ action: "reply", body: text }); }}>
              <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply (the customer gets an email)" maxLength={2000} aria-label="Reply" />
              <button className="btn btn-primary ap-mini" disabled={busy || !text.trim()}>Send</button>
            </form>
            <div style={{ display: "flex", gap: 8 }}>
              {conv.status === "open"
                ? <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => void act({ action: "close" }, "Marked as solved. It reopens if they write again.")}>Mark as solved</button>
                : <button type="button" className="btn btn-ghost ap-mini" disabled={busy} onClick={() => void act({ action: "reopen" }, "Reopened.")}>Reopen</button>}
            </div>
          </section>
        )}
      </>
    );
  }

  return (
    <section className="card glass">
      <input className="input" type="search" placeholder="Search name or email" aria-label="Search conversations" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="ap-chips" role="group" aria-label="Show" style={{ marginTop: 10 }}>
        {(["open", "closed", "all"] as const).map((f) => <button key={f} type="button" className="ap-chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === "open" ? "Open" : f === "closed" ? "Solved" : "All"}</button>)}
      </div>
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role="status">{msg.text}</div>}
      {!rows ? <p className="muted" role="status">Loading…</p> : rows.length === 0 ? <div className="empty">{filter === "open" ? "No open conversations. All caught up." : "Nothing here."}</div> : (
        <ul className="ap-list">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" className="ap-row sup-row" onClick={() => setOpenId(r.id)}>
                <div style={{ minWidth: 0, textAlign: "left" }}>
                  <div className="ap-row-title" style={{ fontWeight: r.unread ? 800 : 600 }}>{r.unread && <span className="sup-new">New</span>}{r.name}</div>
                  <div className="muted ap-row-sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.lastFrom === "admin" ? "You: " : ""}{r.last}</div>
                </div>
                <span className="muted" style={{ fontSize: 12, flex: "none" }}>{when(r.lastAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
