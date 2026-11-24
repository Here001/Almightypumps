"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { monthsLabel } from "@/core/esim";
import { api, naira } from "./api";

type PriceRow = { dataLabel: string; months: string; priceNaira: string; active: boolean };
type Plan = {
  id: string; name: string; network: string; description: string; allowKeepNumber: boolean; keepNumberFee: number; active: boolean;
  prices: { dataLabel: string; months: number; price: number; active: boolean }[];
};
type Order = {
  id: string; publicId: number; plan: string; dataLabel: string; months: number; amount: number; status: string; imei: string;
  numberMode: "new" | "keep"; port: Record<string, string> | null; phoneNumber: string | null; lpa: string | null; qr: string | null;
  customerNote: string | null; adminNote: string | null; createdAt: string; updatedAt: string;
  customer: { name: string; email: string; phone: string | null };
};
type Msg = { ok: boolean; text: string } | null;
const when = (d: string) => new Date(d).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="btn btn-ghost ap-mini" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* ignore */ } }}>{done ? "Copied" : "Copy"}</button>;
}

export function AdminEsim() {
  const [tab, setTab] = useState<"orders" | "checks" | "plans">("orders");
  return (
    <>
      <div className="ap-chips" role="group" aria-label="Section">
        <button type="button" className="ap-chip" aria-pressed={tab === "orders"} onClick={() => setTab("orders")}>Orders</button>
        <button type="button" className="ap-chip" aria-pressed={tab === "checks"} onClick={() => setTab("checks")}>Phones to check</button>
        <button type="button" className="ap-chip" aria-pressed={tab === "plans"} onClick={() => setTab("plans")}>Plans & prices</button>
      </div>
      {tab === "orders" ? <Orders /> : tab === "checks" ? <PhoneChecks /> : <Plans />}
    </>
  );
}

/* ---------------- Orders ---------------- */

async function toDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Read the activation code out of a QR picture (in the browser). null = couldn't read it. */
async function readQr(dataUrl: string): Promise<string | null> {
  try {
    const { default: jsQR } = await import("jsqr");
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const text = jsQR(d.data, d.width, d.height)?.data?.trim() ?? "";
    return /^LPA:1\$[^$\s]+\$[^\s]*$/i.test(text) ? text : null;
  } catch { return null; }
}

function Orders() {
  const [status, setStatus] = useState<"pending" | "delivered" | "refunded">("pending");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(async () => {
    setOrders(null);
    try { setOrders(await api<Order[]>(`/api/admin/esim?view=orders&status=${status}`)); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }, [status]);
  useEffect(() => { void load(); }, [load]);
  return (
    <>
      <div className="ap-chips" role="group" aria-label="Status">
        {(["pending", "delivered", "refunded"] as const).map((s) => (
          <button key={s} type="button" className="ap-chip" aria-pressed={status === s} onClick={() => { setStatus(s); setMsg(null); }}>{s === "pending" ? "To deliver" : s === "delivered" ? "Delivered" : "Refunded"}</button>
        ))}
      </div>
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      {!orders && <p className="muted" role="status">Loading…</p>}
      {orders && orders.length === 0 && <div className="empty">{status === "pending" ? "No eSIM orders waiting. 🎉" : "Nothing here yet."}</div>}
      {orders?.map((o) => <OrderCard key={o.id} o={o} onDone={async (text) => { setMsg({ ok: true, text }); await load(); }} />)}
    </>
  );
}

function OrderCard({ o, onDone }: { o: Order; onDone: (text: string) => Promise<void> }) {
  const [f, setF] = useState({ phoneNumber: "", lpa: "", smdp: "", code: "", note: "" });
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [mode, setMode] = useState<"lpa" | "parts" | "image">("image");
  const [scanned, setScanned] = useState<string | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function send(body: unknown, ok: string) {
    setBusy(true);
    setErr(null);
    try { await api("/api/admin/esim", body); await onDone(ok); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <section className="card glass">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <h2 style={{ fontSize: 18 }}>#E-{o.publicId} · {o.plan} {o.dataLabel} · {monthsLabel(o.months)}</h2>
        <strong>{naira(o.amount)}</strong>
      </div>
      <dl className="ap-facts">
        <dt>Customer</dt><dd>{o.customer.name}<br /><span className="muted">{o.customer.email}{o.customer.phone ? ` · ${o.customer.phone}` : ""}</span></dd>
        <dt>Ordered</dt><dd>{when(o.createdAt)}</dd>
        <dt>IMEI</dt><dd><code className="ap-code">{o.imei}</code> <Copy text={o.imei} /></dd>
        <dt>Number</dt><dd>{o.numberMode === "new" ? "New number" : <strong>Keep existing number</strong>}</dd>
        {o.port && Object.entries({ "Number to keep": o.port.number, Carrier: o.port.carrier, "Account no.": o.port.accountNumber, PIN: o.port.pin, ZIP: o.port.zip, "Account holder": o.port.name })
          .filter(([, v]) => v).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd><code className="ap-code">{v}</code> <Copy text={v} /></dd></Fragment>)}
        {o.status !== "pending" && <><dt>Updated</dt><dd>{when(o.updatedAt)}</dd></>}
        {o.phoneNumber && <><dt>eSIM number</dt><dd>{o.phoneNumber}</dd></>}
        {o.adminNote && <><dt>Refund reason</dt><dd>{o.adminNote}</dd></>}
      </dl>
      {o.qr && (
        // eslint-disable-next-line @next/next/no-img-element -- generated QR data URL
        <img src={o.qr} alt="Delivered QR code" width={160} height={160} style={{ background: "#fff", borderRadius: 8 }} />
      )}
      {o.status === "pending" && !refunding && (
        <form className="ap-subform" style={{ gap: 10 }} onSubmit={(e) => {
          e.preventDefault();
          void send({ action: "deliver", id: o.id, delivery: { phoneNumber: f.phoneNumber, lpa: mode === "lpa" ? f.lpa : mode === "image" && scanned ? scanned : undefined, smdp: mode === "parts" ? f.smdp : undefined, code: mode === "parts" ? f.code : undefined, qrImage: mode === "image" && !scanned ? qrImage ?? undefined : undefined, note: f.note || undefined } },
            `#E-${o.publicId} delivered. The customer can install it now.`);
        }}>
          <strong style={{ fontSize: 15 }}>Deliver this eSIM</strong>
          <p className="muted" style={{ fontSize: 13 }}>Buy it from your supplier with the IMEI above{o.numberMode === "keep" ? " and the number-transfer details" : ""}, then enter what they give you.</p>
          <div className="field"><label htmlFor={`pn-${o.id}`}>The eSIM&apos;s US phone number</label>
            <input id={`pn-${o.id}`} className="input" inputMode="tel" value={f.phoneNumber} onChange={set("phoneNumber")} placeholder="(312) 216-9314" required /></div>
          <div className="ap-chips" role="group" aria-label="How the supplier gave the eSIM">
            <button type="button" className="ap-chip" aria-pressed={mode === "image"} onClick={() => setMode("image")}>Upload QR code</button>
            <button type="button" className="ap-chip" aria-pressed={mode === "lpa"} onClick={() => setMode("lpa")}>Activation code (LPA:1$…)</button>
            <button type="button" className="ap-chip" aria-pressed={mode === "parts"} onClick={() => setMode("parts")}>SM-DP+ address + code</button>
          </div>
          {mode === "lpa" && <div className="field"><label htmlFor={`lpa-${o.id}`}>Activation code</label>
            <input id={`lpa-${o.id}`} className="input" value={f.lpa} onChange={set("lpa")} placeholder="LPA:1$smdp.example.com$ABC-123" autoComplete="off" spellCheck={false} /></div>}
          {mode === "parts" && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div className="field" style={{ flex: "1 1 200px" }}><label htmlFor={`sm-${o.id}`}>SM-DP+ address</label><input id={`sm-${o.id}`} className="input" value={f.smdp} onChange={set("smdp")} placeholder="smdp.example.com" spellCheck={false} /></div>
            <div className="field" style={{ flex: "1 1 200px" }}><label htmlFor={`cd-${o.id}`}>Activation code</label><input id={`cd-${o.id}`} className="input" value={f.code} onChange={set("code")} spellCheck={false} /></div>
          </div>}
          {mode === "image" && <div className="field"><label htmlFor={`qi-${o.id}`}>QR code picture from your supplier (save or screenshot it from their email)</label>
            <input id={`qi-${o.id}`} className="input" type="file" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { try { const url = await toDataUrl(file); setQrImage(url); setScanned(await readQr(url)); setErr(null); } catch { setErr("Couldn't read that picture."); } } }} />
            {qrImage && (
              // eslint-disable-next-line @next/next/no-img-element -- local preview
              <img src={qrImage} alt="QR preview" width={140} height={140} style={{ objectFit: "contain", background: "#fff", borderRadius: 8 }} />
            )}
            {qrImage && (scanned
              ? <div className="form-ok" role="status">QR code read. The customer gets a fresh QR code with the Almighty Pumps logo (not your supplier&apos;s), plus one-tap install and copy buttons.</div>
              : <div className="form-error" role="status">We couldn&apos;t read the code inside this picture, so the customer will see the picture exactly as it is (with any logo on it). For a cleaner result, upload a sharper picture of the QR code.</div>)}
            </div>}
          <div className="field"><label htmlFor={`nt-${o.id}`}>Message to the customer (optional)</label>
            <textarea id={`nt-${o.id}`} className="input" rows={2} value={f.note} onChange={set("note")} placeholder="e.g. Your plan renews on 4 Feb. Keep data roaming on." /></div>
          {err && <div className="form-error" role="alert">{err}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Mark delivered"}</button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setRefunding(true); setErr(null); }}>Can&apos;t deliver: refund</button>
          </div>
        </form>
      )}
      {o.status === "pending" && refunding && (
        <form className="ap-subform" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); void send({ action: "refund", id: o.id, reason }, `#E-${o.publicId} refunded.`); }}>
          <label htmlFor={`rr-${o.id}`} className="muted" style={{ fontSize: 13 }}>Reason (the customer sees this)</label>
          <input id={`rr-${o.id}`} className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. This phone model isn't supported" required minLength={3} />
          {err && <div className="form-error" role="alert">{err}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary ap-mini" disabled={busy}>Refund customer</button>
            <button type="button" className="btn btn-ghost ap-mini" onClick={() => setRefunding(false)}>Back</button>
          </div>
        </form>
      )}
    </section>
  );
}

/* ---------------- Plans ---------------- */

const blankPlan = (): Plan => ({ id: "", name: "", network: "", description: "", allowKeepNumber: true, keepNumberFee: 0, active: true, prices: [] });

function Plans() {
  const [data, setData] = useState<{ plans: Plan[] } | null>(null);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(async () => { setData(await api<{ plans: Plan[] }>("/api/admin/esim")); }, []);
  useEffect(() => { void load().catch((e) => setMsg({ ok: false, text: (e as Error).message })); }, [load]);
  if (!data) return <p className="muted" role="status">Loading…</p>;
  if (editing) return <PlanEditor plan={editing} onClose={async (text) => { setEditing(null); if (text) setMsg({ ok: true, text }); await load(); }} />;
  return (
    <>
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      <section className="card glass">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 18 }}>Plans</h2>
          <button type="button" className="btn btn-primary ap-mini" onClick={() => setEditing(blankPlan())}>+ New plan</button>
        </div>
        {data.plans.length === 0 && <div className="empty">No plans yet. Add one (e.g. “USA eSIM”) with its data sizes, lengths and prices.</div>}
        <ul className="vc-admin-list">
          {data.plans.map((p) => (
            <li key={p.id}>
              <span style={{ minWidth: 0 }}><strong>{p.name}</strong> <span className={`ap-tag${p.active ? " ok" : ""}`}>{p.active ? "On sale" : "Hidden"}</span><br />
                <span className="muted" style={{ fontSize: 13 }}>{p.prices.length} price{p.prices.length === 1 ? "" : "s"}{p.prices.length ? ` · from ${naira(Math.min(...p.prices.map((x) => x.price)))}` : ""}{p.allowKeepNumber ? " · keep-number offered" : ""}</span></span>
              <button type="button" className="btn btn-ghost ap-mini" onClick={() => setEditing(p)}>Edit</button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function PlanEditor({ plan, onClose }: { plan: Plan; onClose: (msg?: string) => Promise<void> }) {
  const [f, setF] = useState({ name: plan.name, network: plan.network, description: plan.description, allowKeepNumber: plan.allowKeepNumber, keepFee: plan.keepNumberFee ? String(plan.keepNumberFee / 100) : "", active: plan.active });
  const [rows, setRows] = useState<PriceRow[]>(plan.prices.map((p) => ({ dataLabel: p.dataLabel, months: String(p.months), priceNaira: String(p.price / 100), active: p.active })));
  const [quick, setQuick] = useState({ data: "1GB, 3GB, 6GB, 10GB", months: "1, 3, 6, 12" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const upd = (i: number, patch: Partial<PriceRow>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  function fill() {
    const ds = quick.data.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    const ms = quick.months.split(/[,\s]+/).map((s) => Number(s)).filter((n) => n >= 1 && n <= 24);
    const have = new Set(rows.map((r) => `${r.dataLabel.toUpperCase()}|${r.months}`));
    const add: PriceRow[] = [];
    for (const d of ds) for (const m of ms) if (!have.has(`${d.toUpperCase()}|${m}`)) add.push({ dataLabel: d, months: String(m), priceNaira: "", active: true });
    setRows((r) => [...r, ...add]);
  }

  return (
    <section className="card glass">
      <h2 style={{ fontSize: 18 }}>{plan.id ? `Edit “${plan.name}”` : "New eSIM plan"}</h2>
      <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await api("/api/admin/esim", { action: "savePlan", plan: {
            id: plan.id || undefined, name: f.name, network: f.network, description: f.description, allowKeepNumber: f.allowKeepNumber,
            keepNumberFeeNaira: f.keepFee.replace(/[₦,\s]/g, "") || 0, active: f.active,
            prices: rows.filter((r) => r.dataLabel.trim() || r.priceNaira.trim()).map((r) => ({ dataLabel: r.dataLabel, months: r.months, priceNaira: r.priceNaira.replace(/[₦,\s]/g, ""), active: r.active })),
          } });
          await onClose(`“${f.name}” saved.`);
        } catch (e2) {
          setErr((e2 as Error).message);
        } finally {
          setBusy(false);
        }
      }}>
        <div className="field"><label htmlFor="ep-name">Plan name (customers see this)</label><input id="ep-name" className="input" value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} placeholder="e.g. USA eSIM" required /></div>
        <div className="field"><label htmlFor="ep-net">Network (optional)</label><input id="ep-net" className="input" value={f.network} onChange={(e) => setF((x) => ({ ...x, network: e.target.value }))} placeholder="e.g. AT&T network · talk, text & data" /></div>
        <div className="field"><label htmlFor="ep-desc">Description (optional)</label><textarea id="ep-desc" className="input" rows={2} value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} placeholder="e.g. Unlimited talk & text. Works on unlocked eSIM phones. Delivered within 24 hours." /></div>
        <label className="ap-toggle"><input type="checkbox" checked={f.allowKeepNumber} onChange={(e) => setF((x) => ({ ...x, allowKeepNumber: e.target.checked }))} /><span>Offer “keep my existing US number”</span></label>
        {f.allowKeepNumber && <div className="field" style={{ maxWidth: 220 }}><label htmlFor="ep-kf">Extra charge for keeping a number (₦)</label><input id="ep-kf" className="input" inputMode="decimal" value={f.keepFee} onChange={(e) => setF((x) => ({ ...x, keepFee: e.target.value }))} placeholder="0" /></div>}
        <label className="ap-toggle"><input type="checkbox" checked={f.active} onChange={(e) => setF((x) => ({ ...x, active: e.target.checked }))} /><span>On sale</span></label>

        <h3 style={{ fontSize: 16, marginTop: 6 }}>Prices</h3>
        <div className="ap-subform" style={{ gap: 8 }}>
          <span className="muted" style={{ fontSize: 13 }}>Quick start: list your data sizes and lengths, tap “Add rows”, then type each price.</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="field" style={{ flex: "2 1 200px" }}><label htmlFor="ep-qd">Data sizes</label><input id="ep-qd" className="input" value={quick.data} onChange={(e) => setQuick((x) => ({ ...x, data: e.target.value }))} /></div>
            <div className="field" style={{ flex: "1 1 140px" }}><label htmlFor="ep-qm">Months</label><input id="ep-qm" className="input" value={quick.months} onChange={(e) => setQuick((x) => ({ ...x, months: e.target.value }))} /></div>
            <button type="button" className="btn btn-ghost ap-mini" onClick={fill}>Add rows</button>
          </div>
        </div>
        {rows.length === 0 && <div className="empty">No prices yet.</div>}
        <ul className="es-price-rows">
          {rows.map((r, i) => (
            <li key={i}>
              <input className="input" aria-label="Data" value={r.dataLabel} onChange={(e) => upd(i, { dataLabel: e.target.value })} placeholder="3GB" />
              <select className="select" aria-label="Months" value={r.months} onChange={(e) => upd(i, { months: e.target.value })}>
                {[1, 2, 3, 6, 12, 24].map((m) => <option key={m} value={m}>{monthsLabel(m)}</option>)}
              </select>
              <input className="input" aria-label="Price in Naira" inputMode="decimal" value={r.priceNaira} onChange={(e) => upd(i, { priceNaira: e.target.value })} placeholder="₦ price" />
              <label className="ap-toggle" style={{ margin: 0 }}><input type="checkbox" checked={r.active} onChange={(e) => upd(i, { active: e.target.checked })} /><span>On</span></label>
              <button type="button" className="btn btn-ghost ap-mini" onClick={() => setRows((x) => x.filter((_, k) => k !== i))} aria-label="Remove price">✕</button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-ghost ap-mini" style={{ alignSelf: "flex-start" }} onClick={() => setRows((x) => [...x, { dataLabel: "", months: "1", priceNaira: "", active: true }])}>+ Add a price</button>
        {err && <div className="form-error" role="alert">{err}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save plan"}</button>
          <button type="button" className="btn btn-ghost" onClick={() => void onClose()}>Cancel</button>
        </div>
      </form>
    </section>
  );
}

type PhoneCheckRow = { id: string; publicId: number; imei: string; status: "pending" | "compatible" | "incompatible"; note: string | null; createdAt: string; checkedAt: string | null; userId: string; name: string; email: string };

/** Customers who asked (for free) whether their phone works. Check the IMEI with the supplier, then answer. */
function PhoneChecks() {
  const [which, setWhich] = useState<"pending" | "done">("pending");
  const [rows, setRows] = useState<PhoneCheckRow[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(async () => {
    try { setRows(await api<PhoneCheckRow[]>(`/api/admin/imei-checks?status=${which}`)); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }, [which]);
  useEffect(() => { setRows(null); void load(); }, [load]);

  async function answer(r: PhoneCheckRow, works: boolean) {
    setBusy(r.id); setMsg(null);
    try {
      await api("/api/admin/imei-checks", { id: r.id, works, note: notes[r.id]?.trim() || undefined });
      setMsg({ ok: true, text: `#C-${r.publicId}: the customer was told it ${works ? "works" : "doesn't work"}.` });
      await load();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  return (
    <section className="card glass">
      <h2>{which === "pending" ? "Phones to check" : "Answered phone checks"}</h2>
      <p className="muted" style={{ fontSize: 14, margin: 0 }}>Customers send their IMEI for free before ordering. Check it with your supplier, then tap an answer: they get an email and see it in the app.</p>
      <div className="ap-chips" role="group" aria-label="Status">
        <button type="button" className="ap-chip" aria-pressed={which === "pending"} onClick={() => setWhich("pending")}>To check</button>
        <button type="button" className="ap-chip" aria-pressed={which === "done"} onClick={() => setWhich("done")}>Answered</button>
      </div>
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      {!rows && <p className="muted" role="status">Loading…</p>}
      {rows && rows.length === 0 && <div className="empty">{which === "pending" ? "No phones waiting to be checked." : "Nothing answered yet."}</div>}
      {rows && rows.length > 0 && (
        <ul className="ap-list">
          {rows.map((r) => (
            <li key={r.id} className="ap-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="ap-row-title" style={{ fontWeight: 600 }}><span className="selectable">{r.imei}</span> <Copy text={r.imei} /></div>
                  <div className="muted ap-row-sub">#C-{r.publicId} · {when(r.createdAt)} · <a className="ap-link" href={`/admin/users/${r.userId}`}>{r.name}</a> · <span className="selectable">{r.email}</span></div>
                </div>
                {r.status !== "pending" && <span className={`status ${r.status === "compatible" ? "ok" : "bad"}`}>{r.status === "compatible" ? "Works" : "Doesn't work"}</span>}
              </div>
              {r.status === "pending" ? (
                <>
                  <div className="field" style={{ margin: 0 }}>
                    <label htmlFor={`pc-${r.id}`} className="muted" style={{ fontSize: 13 }}>Note for the customer (needed if it doesn&apos;t work)</label>
                    <input id={`pc-${r.id}`} className="input" maxLength={500} value={notes[r.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} placeholder="e.g. Phone is locked to a network / has no eSIM" />
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="btn btn-primary ap-mini" disabled={busy === r.id} onClick={() => void answer(r, true)}>Works</button>
                    <button type="button" className="btn btn-ghost ap-mini" disabled={busy === r.id} onClick={() => void answer(r, false)}>Doesn&apos;t work</button>
                  </div>
                </>
              ) : r.note && <div className="ap-row-sub">{r.note}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
