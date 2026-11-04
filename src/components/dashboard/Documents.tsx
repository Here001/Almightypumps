"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Business documents: invoices, receipts and CVs, made in the browser and saved as PDF with the
 * phone/computer's own "Print → Save as PDF". Nothing is uploaded: drafts stay on this device (localStorage).
 */
type Kind = "invoice" | "receipt" | "cv";
type Item = { desc: string; qty: string; price: string };
type Biz = { name: string; address: string; phone: string; email: string; logo: string; bank: string; account: string; accountName: string };
type Sale = { number: string; date: string; due: string; client: string; clientAddress: string; items: Item[]; vat: string; discount: string; currency: string; notes: string; paidBy: string };
type Job = { role: string; org: string; from: string; to: string; details: string };
type Cv = { name: string; title: string; phone: string; email: string; location: string; summary: string; jobs: Job[]; education: Job[]; skills: string };

const KEY = "ap_docs_v1";
const today = () => new Date().toISOString().slice(0, 10);
const blankBiz: Biz = { name: "", address: "", phone: "", email: "", logo: "", bank: "", account: "", accountName: "" };
const blankSale = (kind: "invoice" | "receipt"): Sale => ({
  number: `${kind === "invoice" ? "INV" : "RCT"}-${String(Date.now()).slice(-5)}`, date: today(), due: "", client: "", clientAddress: "",
  items: [{ desc: "", qty: "1", price: "" }], vat: "0", discount: "0", currency: "NGN", notes: "", paidBy: "Bank transfer",
});
const blankJob: Job = { role: "", org: "", from: "", to: "", details: "" };
const blankCv: Cv = { name: "", title: "", phone: "", email: "", location: "", summary: "", jobs: [{ ...blankJob }], education: [{ ...blankJob }], skills: "" };
type Saved = { biz: Biz; invoice: Sale; receipt: Sale; cv: Cv };

const num = (s: string) => { const n = Number(String(s).replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };
const fmt = (n: number, cur: string) => { try { return new Intl.NumberFormat("en-NG", { style: "currency", currency: cur, minimumFractionDigits: 2 }).format(n); } catch { return n.toFixed(2); } };
const longDate = (d: string) => (d ? new Date(d + "T12:00:00").toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" }) : "");

async function shrinkLogo(file: File): Promise<string> {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const scale = Math.min(1, 400 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally { URL.revokeObjectURL(src); }
}

export function Documents() {
  const [kind, setKind] = useState<Kind>("invoice");
  const [data, setData] = useState<Saved>({ biz: blankBiz, invoice: blankSale("invoice"), receipt: blankSale("receipt"), cv: blankCv });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Saved> | null; if (s) setData((d) => ({ ...d, ...s, biz: { ...blankBiz, ...s.biz } })); } catch { /* ignore */ }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* full or private */ } } }, [data, loaded]);

  const print = () => {
    const old = document.title;
    document.title = kind === "cv" ? `CV ${data.cv.name}`.trim() : `${kind === "invoice" ? "Invoice" : "Receipt"} ${data[kind].number}`;
    window.print();
    document.title = old;
  };

  return (
    <>
      <div className="ap-chips" role="group" aria-label="Document type">
        <button type="button" className="ap-chip" aria-pressed={kind === "invoice"} onClick={() => setKind("invoice")}>Invoice</button>
        <button type="button" className="ap-chip" aria-pressed={kind === "receipt"} onClick={() => setKind("receipt")}>Receipt</button>
        <button type="button" className="ap-chip" aria-pressed={kind === "cv"} onClick={() => setKind("cv")}>CV</button>
      </div>
      <div className="doc-layout">
        <section className="card glass doc-form">
          {!loaded ? <p className="muted" role="status">Loading…</p> : kind === "cv"
            ? <CvForm cv={data.cv} set={(cv) => setData({ ...data, cv })} />
            : <SaleForm kind={kind} biz={data.biz} sale={data[kind]} setBiz={(biz) => setData({ ...data, biz })} setSale={(s) => setData({ ...data, [kind]: s })}
                onNew={() => setData({ ...data, [kind]: { ...blankSale(kind), currency: data[kind].currency, vat: data[kind].vat } })} />}
          <p className="muted" style={{ fontSize: 12 }}>Free. Your details are saved on this device only, never uploaded.</p>
        </section>
        <section className="doc-preview-wrap">
          <div className="doc-actions">
            <button type="button" className="btn btn-primary" onClick={print}>Download PDF / Print</button>
            <span className="muted" style={{ fontSize: 12 }}>On the print screen, choose “Save as PDF”.</span>
          </div>
          <div className="doc-scale">
            <div className="doc-sheet">
              {kind === "cv" ? <CvDoc cv={data.cv} /> : <SaleDoc kind={kind} biz={data.biz} sale={data[kind]} />}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function Field({ id, label, value, onChange, type = "text", area, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string; area?: boolean; placeholder?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {area
        ? <textarea id={id} className="input" rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        : <input id={id} className="input" type={type} value={value} placeholder={placeholder} inputMode={type === "number" ? "decimal" : undefined} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

function SaleForm({ kind, biz, sale, setBiz, setSale, onNew }: { kind: "invoice" | "receipt"; biz: Biz; sale: Sale; setBiz: (b: Biz) => void; setSale: (s: Sale) => void; onNew: () => void }) {
  // Open the business details until they're filled in once; after that they stay folded unless tapped.
  const [bizOpen, setBizOpen] = useState(() => !biz.name);
  const b = (k: keyof Biz) => (v: string) => setBiz({ ...biz, [k]: v });
  const s = (k: keyof Sale) => (v: string) => setSale({ ...sale, [k]: v });
  const setItem = (i: number, p: Partial<Item>) => setSale({ ...sale, items: sale.items.map((it, k) => (k === i ? { ...it, ...p } : it)) });
  return (
    <>
      <div className="ap-list-head"><h2>{kind === "invoice" ? "Invoice" : "Receipt"}</h2><button type="button" className="btn btn-ghost ap-mini" onClick={onNew}>Start a new one</button></div>
      <details className="doc-group" open={bizOpen} onToggle={(e) => setBizOpen(e.currentTarget.open)}>
        <summary>Your business {biz.name && <span className="muted">· {biz.name}</span>}</summary>
        <Field id="b-name" label="Business name" value={biz.name} onChange={b("name")} />
        <Field id="b-addr" label="Address" value={biz.address} onChange={b("address")} area />
        <div className="doc-row"><Field id="b-phone" label="Phone" value={biz.phone} onChange={b("phone")} type="tel" /><Field id="b-email" label="Email" value={biz.email} onChange={b("email")} type="email" /></div>
        <div className="field">
          <span style={{ fontWeight: 600, fontSize: 14 }}>Logo (optional)</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
            {biz.logo && <img src={biz.logo} alt="Your logo" style={{ height: 40, borderRadius: 6, background: "#fff" }} />}
            <label className="btn btn-ghost ap-mini">{biz.logo ? "Change" : "Add logo"}<input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { try { setBiz({ ...biz, logo: await shrinkLogo(f) }); } catch { /* not an image */ } } }} /></label>
            {biz.logo && <button type="button" className="btn btn-ghost ap-mini" onClick={() => setBiz({ ...biz, logo: "" })}>Remove</button>}
          </div>
        </div>
        {kind === "invoice" && (
          <div className="doc-row"><Field id="b-bank" label="Bank" value={biz.bank} onChange={b("bank")} /><Field id="b-acct" label="Account number" value={biz.account} onChange={b("account")} /><Field id="b-aname" label="Account name" value={biz.accountName} onChange={b("accountName")} /></div>
        )}
      </details>
      <div className="doc-row">
        <Field id="s-num" label={kind === "invoice" ? "Invoice number" : "Receipt number"} value={sale.number} onChange={s("number")} />
        <Field id="s-date" label="Date" value={sale.date} onChange={s("date")} type="date" />
        {kind === "invoice" && <Field id="s-due" label="Due date" value={sale.due} onChange={s("due")} type="date" />}
      </div>
      <Field id="s-client" label={kind === "invoice" ? "Bill to (customer name)" : "Received from"} value={sale.client} onChange={s("client")} />
      <Field id="s-caddr" label="Customer address / phone (optional)" value={sale.clientAddress} onChange={s("clientAddress")} area />
      <div className="field">
        <span style={{ fontWeight: 600, fontSize: 14 }}>Items</span>
        {sale.items.map((it, i) => (
          <div key={i} className="doc-item">
            <input className="input" aria-label={`Item ${i + 1} description`} placeholder="Description" value={it.desc} onChange={(e) => setItem(i, { desc: e.target.value })} />
            <input className="input" aria-label={`Item ${i + 1} quantity`} placeholder="Qty" inputMode="decimal" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} />
            <input className="input" aria-label={`Item ${i + 1} price`} placeholder="Price" inputMode="decimal" value={it.price} onChange={(e) => setItem(i, { price: e.target.value })} />
            <button type="button" className="ap-close" aria-label={`Remove item ${i + 1}`} disabled={sale.items.length === 1} onClick={() => setSale({ ...sale, items: sale.items.filter((_, k) => k !== i) })}>×</button>
          </div>
        ))}
        <div><button type="button" className="btn btn-ghost ap-mini" onClick={() => setSale({ ...sale, items: [...sale.items, { desc: "", qty: "1", price: "" }] })}>+ Add item</button></div>
      </div>
      <div className="doc-row">
        <div className="field"><label htmlFor="s-cur">Currency</label>
          <select id="s-cur" className="select" value={sale.currency} onChange={(e) => s("currency")(e.target.value)}>
            {["NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR", "CAD"].map((c) => <option key={c}>{c}</option>)}
          </select></div>
        <Field id="s-vat" label="VAT %" value={sale.vat} onChange={s("vat")} type="number" />
        <Field id="s-disc" label="Discount (amount)" value={sale.discount} onChange={s("discount")} type="number" />
      </div>
      {kind === "receipt" && <Field id="s-paid" label="Paid by" value={sale.paidBy} onChange={s("paidBy")} placeholder="Cash, transfer, POS…" />}
      <Field id="s-notes" label="Notes (optional)" value={sale.notes} onChange={s("notes")} area placeholder={kind === "invoice" ? "e.g. Thank you for your business." : "e.g. Goods sold are not returnable."} />
    </>
  );
}

function totals(sale: Sale) {
  const sub = sale.items.reduce((t, i) => t + num(i.qty) * num(i.price), 0);
  const discount = Math.min(num(sale.discount), sub);
  const vat = ((sub - discount) * num(sale.vat)) / 100;
  return { sub, discount, vat, total: sub - discount + vat };
}

function SaleDoc({ kind, biz, sale }: { kind: "invoice" | "receipt"; biz: Biz; sale: Sale }) {
  const t = useMemo(() => totals(sale), [sale]);
  const m = (n: number) => fmt(n, sale.currency);
  return (
    <div className="bdoc">
      <header className="doc-head">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- user's own logo */}
          {biz.logo && <img src={biz.logo} alt="" className="doc-logo" />}
          <div className="doc-biz">{biz.name || "Your business name"}</div>
          <div className="doc-small">{biz.address}</div>
          <div className="doc-small">{[biz.phone, biz.email].filter(Boolean).join(" · ")}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="doc-title">{kind === "invoice" ? "INVOICE" : "RECEIPT"}</div>
          <div className="doc-small">No. {sale.number}</div>
          <div className="doc-small">Date: {longDate(sale.date)}</div>
          {kind === "invoice" && sale.due && <div className="doc-small">Due: {longDate(sale.due)}</div>}
        </div>
      </header>
      <div className="doc-to">
        <div className="doc-label">{kind === "invoice" ? "Bill to" : "Received from"}</div>
        <div style={{ fontWeight: 700 }}>{sale.client || "Customer name"}</div>
        <div className="doc-small" style={{ whiteSpace: "pre-wrap" }}>{sale.clientAddress}</div>
      </div>
      <table className="doc-table">
        <thead><tr><th>Description</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead>
        <tbody>
          {sale.items.filter((i) => i.desc || num(i.price)).map((i, k) => (
            <tr key={k}><td>{i.desc}</td><td>{num(i.qty)}</td><td>{m(num(i.price))}</td><td>{m(num(i.qty) * num(i.price))}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="doc-totals">
        <div><span>Subtotal</span><span>{m(t.sub)}</span></div>
        {t.discount > 0 && <div><span>Discount</span><span>−{m(t.discount)}</span></div>}
        {num(sale.vat) > 0 && <div><span>VAT ({num(sale.vat)}%)</span><span>{m(t.vat)}</span></div>}
        <div className="doc-grand"><span>{kind === "invoice" ? "Total due" : "Total paid"}</span><span>{m(t.total)}</span></div>
      </div>
      {kind === "receipt" && <div className="doc-paid">PAID{sale.paidBy ? ` · ${sale.paidBy}` : ""}</div>}
      {kind === "invoice" && (biz.bank || biz.account) && (
        <div className="doc-to"><div className="doc-label">Pay to</div><div>{biz.bank}</div><div>{biz.account}{biz.accountName ? ` · ${biz.accountName}` : ""}</div></div>
      )}
      {sale.notes && <div className="doc-small" style={{ whiteSpace: "pre-wrap", marginTop: 16 }}>{sale.notes}</div>}
    </div>
  );
}

function CvForm({ cv, set }: { cv: Cv; set: (c: Cv) => void }) {
  const c = (k: keyof Cv) => (v: string) => set({ ...cv, [k]: v });
  const list = (k: "jobs" | "education", what: string, a: string, b: string) => (
    <div className="field">
      <span style={{ fontWeight: 600, fontSize: 14 }}>{what}</span>
      {cv[k].map((j, i) => {
        const up = (p: Partial<Job>) => set({ ...cv, [k]: cv[k].map((x, n) => (n === i ? { ...x, ...p } : x)) });
        return (
          <div key={i} className="ap-subform" style={{ gap: 8 }}>
            <div className="doc-row">
              <input className="input" aria-label={a} placeholder={a} value={j.role} onChange={(e) => up({ role: e.target.value })} />
              <input className="input" aria-label={b} placeholder={b} value={j.org} onChange={(e) => up({ org: e.target.value })} />
            </div>
            <div className="doc-row">
              <input className="input" aria-label="From" placeholder="From (e.g. 2021)" value={j.from} onChange={(e) => up({ from: e.target.value })} />
              <input className="input" aria-label="To" placeholder="To (e.g. Present)" value={j.to} onChange={(e) => up({ to: e.target.value })} />
            </div>
            <textarea className="input" rows={2} aria-label="Details" placeholder={k === "jobs" ? "What you did and achieved (one per line)" : "Grade, course or notes (optional)"} value={j.details} onChange={(e) => up({ details: e.target.value })} />
            {cv[k].length > 1 && <div><button type="button" className="btn btn-ghost ap-mini" onClick={() => set({ ...cv, [k]: cv[k].filter((_, n) => n !== i) })}>Remove</button></div>}
          </div>
        );
      })}
      <div><button type="button" className="btn btn-ghost ap-mini" onClick={() => set({ ...cv, [k]: [...cv[k], { ...blankJob }] })}>+ Add {k === "jobs" ? "job" : "school"}</button></div>
    </div>
  );
  return (
    <>
      <div className="ap-list-head"><h2>CV</h2><button type="button" className="btn btn-ghost ap-mini" onClick={() => { if (window.confirm("Clear this CV and start again?")) set({ ...blankCv, jobs: [{ ...blankJob }], education: [{ ...blankJob }] }); }}>Start again</button></div>
      <div className="doc-row"><Field id="cv-name" label="Full name" value={cv.name} onChange={c("name")} /><Field id="cv-title" label="Job title" value={cv.title} onChange={c("title")} placeholder="e.g. Sales Manager" /></div>
      <div className="doc-row"><Field id="cv-phone" label="Phone" value={cv.phone} onChange={c("phone")} type="tel" /><Field id="cv-email" label="Email" value={cv.email} onChange={c("email")} type="email" /><Field id="cv-loc" label="City" value={cv.location} onChange={c("location")} /></div>
      <Field id="cv-sum" label="About you" value={cv.summary} onChange={c("summary")} area placeholder="Two or three lines about your experience and what you're good at." />
      {list("jobs", "Work experience", "Job title", "Company")}
      {list("education", "Education", "Qualification", "School")}
      <Field id="cv-skills" label="Skills (comma separated)" value={cv.skills} onChange={c("skills")} placeholder="Customer service, Excel, Social media…" />
    </>
  );
}

function CvDoc({ cv }: { cv: Cv }) {
  const section = (title: string, items: Job[]) => {
    const real = items.filter((j) => j.role || j.org);
    if (!real.length) return null;
    return (
      <div className="cv-section">
        <div className="doc-label">{title}</div>
        {real.map((j, i) => (
          <div key={i} className="cv-entry">
            <div className="cv-entry-head"><strong>{j.role}{j.org ? `, ${j.org}` : ""}</strong><span className="doc-small">{[j.from, j.to].filter(Boolean).join(" – ")}</span></div>
            {j.details && <ul>{j.details.split("\n").map((l) => l.trim()).filter(Boolean).map((l, k) => <li key={k}>{l.replace(/^[-•]\s*/, "")}</li>)}</ul>}
          </div>
        ))}
      </div>
    );
  };
  const skills = cv.skills.split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <div className="bdoc cv">
      <header className="cv-head">
        <div className="doc-biz" style={{ fontSize: 26 }}>{cv.name || "Your Name"}</div>
        {cv.title && <div style={{ fontSize: 15, color: "#c2410c", fontWeight: 600 }}>{cv.title}</div>}
        <div className="doc-small">{[cv.phone, cv.email, cv.location].filter(Boolean).join(" · ")}</div>
      </header>
      {cv.summary && <div className="cv-section"><div className="doc-label">Profile</div><p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{cv.summary}</p></div>}
      {section("Work experience", cv.jobs)}
      {section("Education", cv.education)}
      {skills.length > 0 && <div className="cv-section"><div className="doc-label">Skills</div><div className="cv-skills">{skills.map((s) => <span key={s}>{s}</span>)}</div></div>}
    </div>
  );
}
