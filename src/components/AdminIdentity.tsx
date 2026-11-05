"use client";
/* eslint-disable @next/next/no-img-element -- private photos and in-browser previews, not optimisable */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

type File = { id: string; kind: string };
type IdRow = {
  id: string; userId: string; name: string; email: string; accountCreated: string; idType: string; idNumber: string; nameOnId: string; nameMatches: boolean;
  status: string; adminNote: string | null; customerReply: string | null; submittedAt: string; decidedAt: string | null; otherAccountsWithSameId: number; files: File[];
};
type NameRow = {
  id: string; userId: string; email: string; oldName: string; newName: string; reason: string; status: string; adminNote: string | null;
  customerReply: string | null; createdAt: string; decidedAt: string | null; identityStatus: string; files: File[];
};
type Tab = "identity" | "names";

const when = (d: string) => new Date(d).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const KIND: Record<string, string> = { id_front: "ID front", id_back: "ID back", selfie: "Selfie", extra: "Extra" };

function Photos({ files }: { files: File[] }) {
  if (!files.length) return <span className="muted" style={{ fontSize: 13 }}>No photos.</span>;
  return (
    <div className="idc-photos">
      {files.map((f) => (
        <a key={f.id} href={`/api/admin/identity/files/${f.id}`} target="_blank" rel="noreferrer" title="Open full size">
          <img src={`/api/admin/identity/files/${f.id}`} alt={KIND[f.kind] ?? f.kind} loading="lazy" />
          <span>{KIND[f.kind] ?? f.kind}</span>
        </a>
      ))}
    </div>
  );
}

function Decide({ kind, id, onDone, approveLabel }: { kind: "identity" | "name"; id: string; onDone: (msg: string) => void; approveLabel: string }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async (action: "approve" | "reject" | "ask") => {
    setBusy(true); setErr(null);
    try {
      await api("/api/admin/identity", { kind, id, action, note });
      onDone(action === "approve" ? "Approved. The customer has been emailed." : action === "ask" ? "Question sent. The customer has been emailed." : "Rejected. The customer has been emailed.");
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1500}
        placeholder="Question for the customer, or the reason if you reject (they'll see this)" aria-label="Note to the customer" />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary ap-mini" disabled={busy} onClick={() => void go("approve")}>{approveLabel}</button>
        <button type="button" className="btn btn-ghost ap-mini" disabled={busy || note.trim().length < 3} onClick={() => void go("ask")}>Ask for more info</button>
        <button type="button" className="btn btn-ghost ap-mini" disabled={busy || note.trim().length < 3} onClick={() => { if (confirm("Reject this request?")) void go("reject"); }}>Reject</button>
      </div>
      {err && <div className="form-error" role="alert">{err}</div>}
    </div>
  );
}

export function AdminIdentity({ initialTab }: { initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [status, setStatus] = useState<"open" | "done" | "rejected">("open");
  const [rows, setRows] = useState<(IdRow | NameRow)[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => {
    const s = status === "open" ? "open" : status === "rejected" ? "rejected" : tab === "names" ? "approved" : "verified";
    setRows(null);
    return api<(IdRow | NameRow)[]>(`/api/admin/identity?tab=${tab}&status=${s}`).then(setRows).catch((e) => setMsg((e as Error).message));
  }, [tab, status]);
  useEffect(() => { void load(); }, [load]);

  return (
    <section className="card glass" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="ap-chips" role="group" aria-label="Show">
        <button type="button" className="ap-chip" aria-pressed={tab === "identity"} onClick={() => { setTab("identity"); setMsg(null); }}>Identity checks</button>
        <button type="button" className="ap-chip" aria-pressed={tab === "names"} onClick={() => { setTab("names"); setMsg(null); }}>Name changes</button>
      </div>
      <div className="ap-chips" role="group" aria-label="Status">
        {(["open", "done", "rejected"] as const).map((s) => (
          <button key={s} type="button" className="ap-chip" aria-pressed={status === s} onClick={() => setStatus(s)}>{s === "open" ? "Waiting" : s === "done" ? "Approved" : "Rejected"}</button>
        ))}
      </div>
      {msg && <div className="form-ok" role="status">{msg}</div>}
      {!rows ? <p className="muted" role="status">Loading…</p> : rows.length === 0 ? <div className="empty">{status === "open" ? "Nothing waiting. All caught up." : "Nothing here."}</div> : (
        <ul className="ap-list">
          {rows.map((r) => tab === "identity" ? (() => {
            const x = r as IdRow;
            return (
              <li key={x.id} className="idc-item">
                <div className="ap-list-head">
                  <div>
                    <strong>{x.name}</strong> <span className="muted selectable" style={{ fontSize: 13 }}>{x.email}</span>
                    <div className="muted" style={{ fontSize: 13 }}>Sent {when(x.submittedAt)} · account opened {when(x.accountCreated)}{x.status === "info_needed" ? " · waiting for their answer" : ""}</div>
                  </div>
                  <Link className="btn btn-ghost ap-mini" href={`/admin/users/${x.userId}`}>Customer page</Link>
                </div>
                <div className="idc-facts selectable">
                  <span>{x.idType}: <strong>{x.idNumber}</strong></span>
                  <span>Name on ID: <strong>{x.nameOnId}</strong> <span className={`ap-tag${x.nameMatches ? " ok" : ""}`}>{x.nameMatches ? "matches profile" : "doesn't match profile"}</span></span>
                </div>
                {x.otherAccountsWithSameId > 0 && <div className="form-error" role="status">⚠ This ID number is also used on {x.otherAccountsWithSameId} other account{x.otherAccountsWithSameId === 1 ? "" : "s"}.</div>}
                <Photos files={x.files} />
                {x.adminNote && <div className="muted" style={{ fontSize: 13 }}>{x.status === "rejected" ? "Reason" : "You asked"}: “{x.adminNote}”</div>}
                {x.customerReply && <div style={{ fontSize: 14 }}>They answered: “{x.customerReply}”</div>}
                {(x.status === "pending" || x.status === "info_needed") && (
                  <Decide kind="identity" id={x.id} approveLabel="Approve identity" onDone={(m) => { setMsg(m); void load(); }} />
                )}
              </li>
            );
          })() : (() => {
            const x = r as NameRow;
            return (
              <li key={x.id} className="idc-item">
                <div className="ap-list-head">
                  <div>
                    <strong>{x.oldName} → {x.newName}</strong> <span className="muted selectable" style={{ fontSize: 13 }}>{x.email}</span>
                    <div className="muted" style={{ fontSize: 13 }}>Asked {when(x.createdAt)} · identity {x.identityStatus === "verified" ? "verified" : "not verified"}{x.status === "info_needed" ? " · waiting for their answer" : ""}</div>
                  </div>
                  <Link className="btn btn-ghost ap-mini" href={`/admin/users/${x.userId}`}>Customer page</Link>
                </div>
                <div style={{ fontSize: 14 }} className="selectable">Reason: “{x.reason}”</div>
                {x.identityStatus === "verified" && <div className="muted" style={{ fontSize: 13 }}>⚠ Their identity is already verified. Make sure the new name matches their ID (ask for a document if not), because withdrawals must match this name.</div>}
                <Photos files={x.files} />
                {x.adminNote && <div className="muted" style={{ fontSize: 13 }}>{x.status === "rejected" ? "Reason" : "You asked"}: “{x.adminNote}”</div>}
                {x.customerReply && <div style={{ fontSize: 14 }}>They answered: “{x.customerReply}”</div>}
                {(x.status === "pending" || x.status === "info_needed") && (
                  <Decide kind="name" id={x.id} approveLabel="Approve name change" onDone={(m) => { setMsg(m); void load(); }} />
                )}
              </li>
            );
          })())}
        </ul>
      )}
    </section>
  );
}
