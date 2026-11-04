"use client";

import { useEffect, useState } from "react";
import type { LegalKind } from "@/content/legal";
import { api } from "./api";
import { RichText } from "./RichText";

type Doc = { body: string; updated: string; edited: boolean };
type Data = { privacy: Doc; terms: Doc; defaults: Record<LegalKind, string> };
const NAMES: Record<LegalKind, string> = { privacy: "Privacy Policy", terms: "Terms of Service" };
const nice = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function AdminLegal() {
  const [data, setData] = useState<Data | null>(null);
  const [kind, setKind] = useState<LegalKind>("privacy");
  const [text, setText] = useState<Record<LegalKind, string>>({ privacy: "", terms: "" });
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const d = await api<Data>("/api/admin/legal");
    setData(d);
    setText({ privacy: d.privacy.body, terms: d.terms.body });
  };
  useEffect(() => { void load().catch((e) => setMsg({ ok: false, text: (e as Error).message })); }, []);

  const dirty = data ? text.privacy !== data.privacy.body || text.terms !== data.terms.body : false;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!data) return msg ? <div className="form-error" role="alert">{msg.text}</div> : <p className="muted" role="status">Loading…</p>;
  const doc = data[kind];
  const changed = text[kind] !== doc.body;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ updated: string }>("/api/admin/legal", { action: "save", kind, body: text[kind] });
      await load();
      setMsg({ ok: true, text: `${NAMES[kind]} saved and live. “Last updated” is now ${nice(r.updated)}.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!window.confirm(`Put the ${NAMES[kind]} back to the original text? Your edited version will be removed.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/admin/legal", { action: "reset", kind });
      await load();
      setMsg({ ok: true, text: `${NAMES[kind]} is back to the original text.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card glass">
      <div className="ap-chips" role="group" aria-label="Page">
        {(["privacy", "terms"] as const).map((k) => (
          <button key={k} type="button" className="ap-chip" aria-pressed={kind === k} onClick={() => { setKind(k); setMsg(null); }}>
            {NAMES[k]}{text[k] !== data[k].body ? " •" : ""}
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        {doc.edited ? `Edited version, last updated ${nice(doc.updated)}.` : "Showing the original text."} <a href={`/${kind}`} target="_blank" rel="noreferrer">View live page ↗</a>
      </p>
      <details className="ap-subform" style={{ fontSize: 13 }}>
        <summary style={{ cursor: "pointer" }}><b>How to format</b></summary>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
          <li><code>## 1. Heading</code> for a section title, <code>### Smaller heading</code> for a sub-title</li>
          <li><code>- text</code> at the start of a line for a bullet point</li>
          <li>An empty line starts a new paragraph</li>
          <li><code>**bold words**</code> for bold</li>
          <li><code>[link text](https://…)</code>, <code>[email us](mailto:support@almightypumps.com)</code> or <code>[Terms](/terms)</code> for links</li>
        </ul>
      </details>
      <div className="ap-chips" role="group" aria-label="View">
        <button type="button" className="ap-chip" aria-pressed={view === "edit"} onClick={() => setView("edit")}>Edit</button>
        <button type="button" className="ap-chip" aria-pressed={view === "preview"} onClick={() => setView("preview")}>Preview</button>
      </div>
      {view === "edit" ? (
        <textarea
          className="input legal-editor" aria-label={`${NAMES[kind]} text`} value={text[kind]} spellCheck
          onChange={(e) => setText((t) => ({ ...t, [kind]: e.target.value }))}
        />
      ) : (
        <div className="legal-doc legal-preview"><RichText text={text[kind]} /></div>
      )}
      <p className="muted" style={{ fontSize: 12 }}>{text[kind].length.toLocaleString("en-NG")} / 60,000 characters</p>
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" disabled={busy || !changed} onClick={() => void save()}>{busy ? "Saving…" : "Save & publish"}</button>
        {changed && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setText((t) => ({ ...t, [kind]: doc.body }))}>Undo changes</button>}
        {doc.edited && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void reset()}>Reset to original</button>}
      </div>
    </section>
  );
}
