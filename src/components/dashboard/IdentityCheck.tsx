"use client";
/* eslint-disable @next/next/no-img-element -- private photos and in-browser previews, not optimisable */

import { useCallback, useEffect, useState } from "react";
import { IDENTITY_ID_TYPES } from "@/core/identity";
import { api } from "../api";
import { shrink } from "./photos";

type Status = "none" | "pending" | "info_needed" | "verified" | "rejected";
type NameChange = { id: string; newName: string; oldName: string; status: "pending" | "info_needed" | "approved" | "rejected" | "cancelled"; adminNote: string | null; createdAt: string };
export type IdentityData = {
  name: string; status: Status;
  check: { idType: string; last4: string; nameOnId: string; adminNote: string | null; customerReply: string | null } | null;
  nameChange: NameChange | null;
};
type Msg = { ok: boolean; text: string } | null;

export function useIdentity() {
  const [data, setData] = useState<IdentityData | null>(null);
  const load = useCallback(() => api<IdentityData>("/api/me/identity").then(setData).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  return { data, reload: load };
}

/** One photo slot: take/choose a picture, shrunk in the browser. */
function PhotoSlot({ label, hint, value, onChange, selfie }: { label: string; hint: string; value: string | null; onChange: (v: string | null) => void; selfie?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="field">
      <label>{label}</label>
      <div className="idc-slot">
        {value ? <img src={value} alt="" /> : <span className="muted" style={{ fontSize: 13 }}>{hint}</span>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label className="btn btn-ghost ap-mini" style={{ cursor: "pointer" }}>
            {busy ? "Loading…" : value ? "Change" : selfie ? "Take selfie" : "Add photo"}
            <input type="file" accept="image/*" {...(selfie ? { capture: "user" as const } : {})} hidden onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = "";
              if (!f) return;
              setBusy(true);
              try { onChange(await shrink(f)); } finally { setBusy(false); }
            }} />
          </label>
          {value && <button type="button" className="ap-link" onClick={() => onChange(null)}>Remove</button>}
        </div>
      </div>
    </div>
  );
}

/** Extra photos (up to 4) for replies and name change requests. */
export function ExtraPhotos({ photos, setPhotos }: { photos: string[]; setPhotos: (p: string[]) => void }) {
  return (
    <div className="field">
      <label>Photos (optional, up to 4)</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {photos.map((p, i) => (
          <button key={i} type="button" className="idc-thumb" title="Remove" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}><img src={p} alt={`Photo ${i + 1} (tap to remove)`} /></button>
        ))}
        {photos.length < 4 && (
          <label className="btn btn-ghost ap-mini" style={{ cursor: "pointer" }}>Add photo
            <input type="file" accept="image/*" multiple hidden onChange={async (e) => {
              const files = Array.from(e.target.files ?? []).slice(0, 4 - photos.length); e.target.value = "";
              const out: string[] = [];
              for (const f of files) out.push(await shrink(f));
              setPhotos([...photos, ...out]);
            }} />
          </label>
        )}
      </div>
    </div>
  );
}

function Reply({ action, onDone }: { action: "reply" | "name_reply"; onDone: () => void }) {
  const [reply, setReply] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <form style={{ display: "flex", flexDirection: "column", gap: 10 }} onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setMsg(null);
      try { await api("/api/me/identity", { action, reply, photos }); setReply(""); setPhotos([]); onDone(); }
      catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
      finally { setBusy(false); }
    }}>
      <div className="field"><label htmlFor={`rp-${action}`}>Your answer</label>
        <textarea id={`rp-${action}`} className="input" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={1500} required /></div>
      <ExtraPhotos photos={photos} setPhotos={setPhotos} />
      <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={busy || reply.trim().length < 2}>{busy ? "Sending…" : "Send answer"}</button>
      {msg && <div className="form-error" role="alert">{msg.text}</div>}
    </form>
  );
}

function Wrap({ compact, children }: { compact?: boolean; children: React.ReactNode }) {
  return compact ? <div className="idc-box">{children}</div> : <section className="card glass" id="identity">{children}</section>;
}

/** Identity check card (Settings, and inside Withdraw until verified). */
export function IdentityCheck({ data, reload, compact }: { data: IdentityData | null; reload: () => void; compact?: boolean }) {
  const [form, setForm] = useState({ idType: "nin", idNumber: "", nameOnId: "" });
  const [front, setFront] = useState<string | null>(null);
  const [back, setBack] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => { if (data && !form.nameOnId) setForm((f) => ({ ...f, nameOnId: data.name })); }, [data, form.nameOnId]);
  if (!data) return <p className="muted" role="status">Loading…</p>;
  const type = IDENTITY_ID_TYPES.find((t) => t.id === form.idType)!;

  if (data.status === "verified") {
    return compact ? null : <Wrap compact={compact}><h2>Identity check</h2><div className="form-ok" role="status">✓ Verified as {data.name}. You can withdraw to bank accounts in this name.</div></Wrap>;
  }
  if (data.status === "pending") {
    return <Wrap compact={compact}><h2>Identity check</h2><p className="muted" style={{ margin: 0 }}>Thanks! We&apos;re checking your {data.check ? `ID ending ${data.check.last4}` : "ID"}. This usually takes a few hours, and we&apos;ll email you when it&apos;s done.</p></Wrap>;
  }
  if (data.status === "info_needed") {
    return (
      <Wrap compact={compact}>
        <h2>Identity check: we need a bit more</h2>
        <div className="form-error" role="status" style={{ whiteSpace: "pre-wrap" }}>Our team asked: {data.check?.adminNote}</div>
        <Reply action="reply" onDone={reload} />
      </Wrap>
    );
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Wrap compact={compact}>
      <h2>{compact ? "Verify your identity to withdraw" : "Identity check"}</h2>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        For your safety, withdrawals only go to a bank account in your own name, and we check your ID once before your first withdrawal.
        The name on your ID must match your profile name: <strong className="selectable">{data.name}</strong>.
      </p>
      {data.status === "rejected" && data.check?.adminNote && <div className="form-error" role="status">Last time we couldn&apos;t approve it: {data.check.adminNote}</div>}
      <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setMsg(null);
        try {
          await api("/api/me/identity", { action: "submit", ...form, front, ...(back ? { back } : {}), selfie });
          reload();
        } catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
        finally { setBusy(false); }
      }}>
        <div className="field"><label htmlFor="idc-type">ID type</label>
          <select id="idc-type" className="select" value={form.idType} onChange={set("idType")}>
            {IDENTITY_ID_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select></div>
        <div className="field"><label htmlFor="idc-num">{form.idType === "bvn" ? "BVN" : "ID number"}</label>
          <input id="idc-num" className="input" value={form.idNumber} onChange={set("idNumber")} placeholder={type.hint} autoComplete="off" required /></div>
        <div className="field"><label htmlFor="idc-name">Full name exactly as on the ID</label>
          <input id="idc-name" className="input" value={form.nameOnId} onChange={set("nameOnId")} required /></div>
        <PhotoSlot label={form.idType === "bvn" ? "Photo ID (front)" : "ID (front)"} hint="A clear photo, all four corners visible" value={front} onChange={setFront} />
        <PhotoSlot label="ID (back, optional)" hint="If your card has details on the back" value={back} onChange={setBack} />
        <PhotoSlot label="Selfie holding your ID" hint="Your face and the ID both clearly visible" value={selfie} onChange={setSelfie} selfie />
        <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={busy || !front || !selfie || !form.idNumber.trim()}>{busy ? "Sending…" : "Send for checking"}</button>
        <span className="muted" style={{ fontSize: 12 }}>Your ID is only seen by our team, stored securely, and used to protect your account.</span>
        {msg && <div className="form-error" role="alert">{msg.text}</div>}
      </form>
    </Wrap>
  );
}

/** Name change: request form, status, and answering the admin's question. */
export function NameChange({ data, reload }: { data: IdentityData | null; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [reason, setReason] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  if (!data) return null;
  const nc = data.nameChange;
  const live = nc && (nc.status === "pending" || nc.status === "info_needed");
  if (live) {
    return (
      <div className="idc-box">
        <strong>Name change to “{nc.newName}”</strong>
        {nc.status === "pending"
          ? <span className="muted" style={{ fontSize: 14 }}>Waiting for our team to approve it. We&apos;ll email you.</span>
          : <><div className="form-error" role="status" style={{ whiteSpace: "pre-wrap" }}>Our team asked: {nc.adminNote}</div><Reply action="name_reply" onDone={reload} /></>}
        <button type="button" className="ap-link" style={{ alignSelf: "flex-start" }} onClick={async () => { await api("/api/me/identity", { action: "name_cancel" }).catch(() => {}); reload(); }}>Cancel this request</button>
      </div>
    );
  }
  return (
    <>
      {nc && nc.status === "rejected" && <div className="form-error" role="status">Your change to “{nc.newName}” wasn&apos;t approved{nc.adminNote ? `: ${nc.adminNote}` : "."}</div>}
      {nc && nc.status === "approved" && msg === null && !open && <span className="muted" style={{ fontSize: 13 }}>Name change approved.</span>}
      {!open ? <button type="button" className="ap-link" style={{ alignSelf: "flex-start" }} onClick={() => setOpen(true)}>Change my name</button> : (
        <div className="idc-box">
          <strong>Request a name change</strong>
          <span className="muted" style={{ fontSize: 13 }}>For security, name changes are checked by our team. We may ask for an ID or document.</span>
          <div className="field"><label htmlFor="nc-new">New full name</label><input id="nc-new" className="input" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} /></div>
          <div className="field"><label htmlFor="nc-why">Why is it changing?</label><textarea id="nc-why" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="e.g. I made a typo, or I got married" /></div>
          <ExtraPhotos photos={photos} setPhotos={setPhotos} />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-primary ap-mini" disabled={busy || newName.trim().length < 3 || reason.trim().length < 5} onClick={async () => {
              setBusy(true); setMsg(null);
              try { await api("/api/me/identity", { action: "name", newName, reason, photos }); setOpen(false); setNewName(""); setReason(""); setPhotos([]); reload(); }
              catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
              finally { setBusy(false); }
            }}>{busy ? "Sending…" : "Send request"}</button>
            <button type="button" className="btn btn-ghost ap-mini" onClick={() => setOpen(false)}>Cancel</button>
          </div>
          {msg && <div className="form-error" role="alert">{msg.text}</div>}
        </div>
      )}
    </>
  );
}
