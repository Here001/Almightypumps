"use client";

import { useCallback, useEffect, useState } from "react";
import { QUESTION_TYPE_LABELS, QUESTION_TYPES, type Question, type QuestionType } from "@/core/listingQuestions";
import { api } from "./api";

type Category = { slug: string; name: string; description: string; questions: Question[]; requiresReview: boolean; active: boolean; ads: number };
type Draft = { id?: string; label: string; type: QuestionType; required: boolean; options: string; help: string };
type Msg = { ok: boolean; text: string } | null;

const toDraft = (q: Question): Draft => ({ id: q.id, label: q.label, type: q.type, required: q.required, options: (q.options ?? []).join("\n"), help: q.help ?? "" });
const blank = (): Draft => ({ label: "", type: "text", required: true, options: "", help: "" });

export function AdminP2PCategories() {
  const [cats, setCats] = useState<Category[] | null>(null);
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const c = await api<Category[]>("/api/admin/p2p-categories");
      setCats(c);
      setSelected((s) => s ?? c[0]?.slug ?? "new");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (error) return <div className="form-error" role="alert">{error}</div>;
  if (!cats) return <p className="muted" role="status">Loading…</p>;
  const current = cats.find((c) => c.slug === selected);

  return (
    <>
      <section className="card glass">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <h2>Categories</h2>
          <button type="button" className="btn btn-primary ap-mini" onClick={() => setSelected("new")}>+ New category</button>
        </div>
        <div className="ap-chips ap-chips-wrap" role="group" aria-label="Category">
          {cats.map((c) => (
            <button key={c.slug} type="button" className="ap-chip" aria-pressed={c.slug === selected} onClick={() => setSelected(c.slug)}>
              {c.name} <span>{c.questions.length} q{c.active ? "" : " · hidden"}</span>
            </button>
          ))}
        </div>
      </section>
      {selected === "new" && <Editor key="new" onSaved={async (c) => { await load(); setSelected(c.slug); }} />}
      {current && <Editor key={current.slug} category={current} onSaved={load} />}
    </>
  );
}

function Editor({ category, onSaved }: { category?: Category; onSaved: (c: Category) => void | Promise<void> }) {
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [requiresReview, setRequiresReview] = useState(category?.requiresReview ?? false);
  const [active, setActive] = useState(category?.active ?? true);
  const [qs, setQs] = useState<Draft[]>(category ? category.questions.map(toDraft) : [blank()]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const upd = (i: number, patch: Partial<Draft>) => setQs((a) => a.map((q, k) => (k === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) => setQs((a) => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return a; [b[i], b[j]] = [b[j], b[i]]; return b; });

  return (
    <section className="card glass">
      <h2>{category ? `Edit “${category.name}”` : "New category"}</h2>
      {category && <p className="muted" style={{ fontSize: 13 }}>{category.ads} live ad{category.ads === 1 ? "" : "s"} in this category.</p>}
      <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          const c = await api<Category>("/api/admin/p2p-categories", {
            slug: category?.slug, name, description, requiresReview, active,
            questions: qs.filter((q) => q.label.trim()).map((q) => ({ id: q.id, label: q.label, type: q.type, required: q.required, options: q.options, help: q.help })),
          });
          setMsg({ ok: true, text: category ? "Saved. Sellers see these questions when they post in this category." : `“${c.name}” created. Sellers can post in it now.` });
          await onSaved(c);
        } catch (err) {
          setMsg({ ok: false, text: (err as Error).message });
        } finally {
          setBusy(false);
        }
      }}>
        <div className="field"><label htmlFor="pc-name">Category name</label>
          <input id="pc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bags" required /></div>
        <div className="field"><label htmlFor="pc-desc">Short description for sellers (optional)</label>
          <input id="pc-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Handbags, backpacks and travel bags" /></div>
        <label className="ap-toggle"><input type="checkbox" checked={requiresReview} onChange={(e) => setRequiresReview(e.target.checked)} /><span>Ads in this category need my approval before going live</span></label>
        {category && <label className="ap-toggle"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Open for new ads (untick to hide the category)</span></label>}

        <h3 style={{ fontSize: 16, marginTop: 6 }}>Questions for sellers</h3>
        <p className="muted" style={{ fontSize: 13 }}>Sellers answer these when posting in this category. Buyers see the answers on the ad.</p>
        {qs.length === 0 && <div className="empty">No questions: sellers only fill in the basics (title, description, price, stock).</div>}
        {qs.map((q, i) => (
          <div key={i} className="ap-subform" style={{ gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div className="field" style={{ flex: "2 1 220px" }}><label htmlFor={`q-l-${i}`}>Question {i + 1}</label>
                <input id={`q-l-${i}`} className="input" value={q.label} onChange={(e) => upd(i, { label: e.target.value })} placeholder="e.g. Condition" /></div>
              <div className="field" style={{ flex: "1 1 150px" }}><label htmlFor={`q-t-${i}`}>Answer type</label>
                <select id={`q-t-${i}`} className="select" value={q.type} onChange={(e) => upd(i, { type: e.target.value as QuestionType })}>
                  {QUESTION_TYPES.map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>)}
                </select></div>
            </div>
            {q.type === "select" && (
              <div className="field"><label htmlFor={`q-o-${i}`}>Choices (one per line)</label>
                <textarea id={`q-o-${i}`} className="input" rows={3} value={q.options} onChange={(e) => upd(i, { options: e.target.value })} placeholder={"New\nUsed"} /></div>
            )}
            <div className="field"><label htmlFor={`q-h-${i}`}>Hint for sellers (optional)</label>
              <input id={`q-h-${i}`} className="input" value={q.help} onChange={(e) => upd(i, { help: e.target.value })} placeholder="e.g. Include the brand if you know it" /></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <label className="ap-toggle"><input type="checkbox" checked={q.required} onChange={(e) => upd(i, { required: e.target.checked })} /><span>Required</span></label>
              <span style={{ flex: 1 }} />
              <button type="button" className="btn btn-ghost ap-mini" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
              <button type="button" className="btn btn-ghost ap-mini" onClick={() => move(i, 1)} disabled={i === qs.length - 1} aria-label="Move down">↓</button>
              <button type="button" className="btn btn-ghost ap-mini" onClick={() => setQs((a) => a.filter((_, k) => k !== i))}>Remove</button>
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-ghost ap-mini" style={{ alignSelf: "flex-start" }} onClick={() => setQs((a) => [...a, blank()])}>+ Add question</button>
        <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={busy}>{busy ? "Saving…" : category ? "Save category" : "Create category"}</button>
        {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      </form>
    </section>
  );
}
