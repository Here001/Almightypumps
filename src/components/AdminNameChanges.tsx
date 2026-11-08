"use client";
/* eslint-disable @next/next/no-img-element -- private admin-only documents */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

type Row = {
  id: string; userId: string; email: string; oldName: string; newName: string; reason: string; status: string;
  adminNote: string | null; customerReply: string | null; createdAt: string; decidedAt: string | null; files: string[];
};
const when = (d: string) => new Date(d).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function Decide({ id, onDone }: { id: string; onDone: (msg: string) => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async (action: "approve" | "reject" | "ask") => {
    setBusy(true); setErr(null);
    try {
      await api("/api/admin/name-changes", { id, action, note });
      onDone(action === "approve" ? "Approved: their name is changed and they've been emailed." : action === "ask" ? "Question sent. They've been emailed." : "Rejected. They've been emailed.");
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1500}
        placeholder="What do you need from them? Or the reason if you reject (they'll see this)" aria-label="Note to the customer" />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary ap-mini" disabled={busy} onClick={() => void go("approve")}>Approve name change</button>
        <button type="button" className="btn btn-ghost ap-mini" disabled={busy || note.trim().length < 3} onClick={() => void go("ask")}>Ask for more info</button>
        <button type="button" className="btn btn-ghost ap-mini" disabled={busy || note.trim().length < 3} onClick={() => { if (confirm("Reject this name change?")) void go("reject"); }}>Reject</button>
      </div>
      {err && <div className="form-error" role="alert">{err}</div>}
    </div>
  );
}

export function AdminNameChanges() {
  const [status, setStatus] = useState<"open" | "approved" | "rejected">("open");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => { setRows(null); return api<Row[]>(`/api/admin/name-changes?status=${status}`).then(setRows).catch((e) => setMsg({ ok: false, text: (e as Error).message })); }, [status]);
  useEffect(() => { void load(); }, [load]);

  return (
    <section className="card glass" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="ap-chips" role="group" aria-label="Show">
        {(["open", "approved", "rejected"] as const).map((s) => (
          <button key={s} type="button" className="ap-chip" aria-pressed={status === s} onClick={() => { setStatus(s); setMsg(null); }}>{s === "open" ? "Waiting" : s === "approved" ? "Approved" : "Rejected"}</button>
        ))}
      </div>
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role="status">{msg.text}</div>}
      {!rows ? <p className="muted" role="status">Loading…</p> : rows.length === 0 ? <div className="empty">{status === "open" ? "No name changes waiting." : "Nothing here."}</div> : (
        <ul className="ap-list">
          {rows.map((x) => (
            <li key={x.id} className="nc-item">
              <div className="ap-list-head">
                <div>
                  <strong>{x.oldName} → {x.newName}</strong> <span className="muted selectable" style={{ fontSize: 13 }}>{x.email}</span>
                  <div className="muted" style={{ fontSize: 13 }}>Asked {when(x.createdAt)}{x.status === "info_needed" ? " · waiting for their answer" : x.decidedAt ? ` · decided ${when(x.decidedAt)}` : ""}</div>
                </div>
                <Link className="btn btn-ghost ap-mini" href={`/admin/users/${x.userId}`}>Customer page</Link>
              </div>
              <div style={{ fontSize: 14 }} className="selectable">Reason: “{x.reason}”</div>
              {x.files.length > 0 ? (
                <div className="nc-photos">
                  {x.files.map((f, i) => <a key={f} href={`/api/admin/name-changes/files/${f}`} target="_blank" rel="noreferrer"><img src={`/api/admin/name-changes/files/${f}`} alt={`Document ${i + 1}`} loading="lazy" /></a>)}
                </div>
              ) : <span className="muted" style={{ fontSize: 13 }}>No documents sent.</span>}
              {x.adminNote && <div className="muted" style={{ fontSize: 13 }}>{x.status === "rejected" ? "Reason" : "You asked"}: “{x.adminNote}”</div>}
              {x.customerReply && <div style={{ fontSize: 14 }}>They answered: “{x.customerReply}”</div>}
              {(x.status === "pending" || x.status === "info_needed") && <Decide id={x.id} onDone={(m) => { setMsg({ ok: true, text: m }); void load(); }} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
