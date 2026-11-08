"use client";
/* eslint-disable @next/next/no-img-element -- in-browser previews of photos the customer picked */

import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { shrink } from "./photos";

type Req = { id: string; newName: string; oldName: string; status: "pending" | "info_needed" | "approved" | "rejected" | "cancelled"; adminNote: string | null };
type Data = { name: string; request: Req | null };

/** Up to 4 photos (documents), shrunk in the browser. Tap one to remove it. */
function Photos({ photos, setPhotos }: { photos: string[]; setPhotos: (p: string[]) => void }) {
  return (
    <div className="field">
      <label>Documents (optional, up to 4 photos)</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {photos.map((p, i) => (
          <button key={i} type="button" className="nc-thumb" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}><img src={p} alt={`Photo ${i + 1} (tap to remove)`} /></button>
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

/** Under the Name field in Settings: request a change, see its status, answer the admin's question. */
export function NameChange({ onChanged }: { onChanged: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const load = useCallback(() => api<Data>("/api/me/name-change").then(setData).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!data) return null;
  const r = data.request;
  const send = async (body: Record<string, unknown>) => {
    setBusy(true); setErr(null);
    try { await api("/api/me/name-change", body); setOpen(false); setNewName(""); setText(""); setPhotos([]); await load(); onChanged(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  if (r && (r.status === "pending" || r.status === "info_needed")) {
    return (
      <div className="nc-box">
        <strong>Name change to “{r.newName}”</strong>
        {r.status === "pending" ? <span className="muted" style={{ fontSize: 14 }}>Waiting for our team to approve it. We&apos;ll email you.</span> : (
          <>
            <div className="form-error" role="status" style={{ whiteSpace: "pre-wrap" }}>Our team asked: {r.adminNote}</div>
            <div className="field"><label htmlFor="nc-reply">Your answer</label>
              <textarea id="nc-reply" className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={1500} /></div>
            <Photos photos={photos} setPhotos={setPhotos} />
            <button type="button" className="btn btn-primary ap-mini" style={{ alignSelf: "flex-start" }} disabled={busy || text.trim().length < 2} onClick={() => void send({ action: "reply", reply: text, photos })}>{busy ? "Sending…" : "Send answer"}</button>
          </>
        )}
        <button type="button" className="ap-link" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={() => void send({ action: "cancel" })}>Cancel this request</button>
        {err && <div className="form-error" role="alert">{err}</div>}
      </div>
    );
  }
  return (
    <>
      {r?.status === "rejected" && <div className="form-error" role="status">Your change to “{r.newName}” wasn&apos;t approved{r.adminNote ? `: ${r.adminNote}` : "."}</div>}
      {!open ? <button type="button" className="ap-link" style={{ alignSelf: "flex-start" }} onClick={() => setOpen(true)}>Change my name</button> : (
        <div className="nc-box">
          <strong>Request a name change</strong>
          <span className="muted" style={{ fontSize: 13 }}>For your security, name changes are checked by our team (withdrawals only go to bank accounts in your name). We may ask for an ID or document.</span>
          <div className="field"><label htmlFor="nc-new">New full name</label><input id="nc-new" className="input" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} /></div>
          <div className="field"><label htmlFor="nc-why">Why is it changing?</label><textarea id="nc-why" className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="e.g. I made a typo, or I got married" /></div>
          <Photos photos={photos} setPhotos={setPhotos} />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-primary ap-mini" disabled={busy || newName.trim().length < 3 || text.trim().length < 5}
              onClick={() => void send({ action: "request", newName, reason: text, photos })}>{busy ? "Sending…" : "Send request"}</button>
            <button type="button" className="btn btn-ghost ap-mini" onClick={() => { setOpen(false); setErr(null); }}>Cancel</button>
          </div>
          {err && <div className="form-error" role="alert">{err}</div>}
        </div>
      )}
    </>
  );
}
