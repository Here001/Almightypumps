"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../api";
import { useCurrency } from "./Currency";
import { Copy } from "./instantUi";

type Addr = { name: string; phone: string; email: string; line1: string; line2: string; city: string; state: string; zip: string; country: "NG" | "US" };
type Rate = { rateId: string; carrier: string; logo: string | null; service: string | null; priceKobo: number; deliveryTime: string | null; pickupTime: string | null };
type Quote = { quoteId: string; international: boolean; rates: Rate[] };
type Ship = { id: string; code: string; status: string; carrier: string | null; carrierTracking: string | null; from: string; to: string; toName: string; priceKobo: number | null; labelUrl: string | null; canCancel: boolean; bookedAt: string };
type Info = { enabled: boolean; states: string[]; shipments: Ship[] };

const blank = (country: "NG" | "US"): Addr => ({ name: "", phone: "", email: "", line1: "", line2: "", city: "", state: "", zip: "", country });
export const SHIP_STATUS: Record<string, { label: string; tone: string }> = {
  booked: { label: "Waiting for pickup", tone: "info" }, in_transit: { label: "On the way", tone: "info" }, delivered: { label: "Delivered", tone: "ok" }, cancelled: { label: "Cancelled, refunded", tone: "bad" },
};

function AddressFields({ prefix, title, a, set, states, lockCountry }: { prefix: string; title: string; a: Addr; set: (a: Addr) => void; states: string[]; lockCountry?: boolean }) {
  const f = (k: keyof Addr) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set({ ...a, [k]: e.target.value });
  return (
    <fieldset className="ap-subform" style={{ gap: 10, border: 0 }}>
      <legend style={{ fontWeight: 700, padding: 0, marginBottom: 6 }}>{title}</legend>
      {!lockCountry && (
        <div className="ap-chips" role="group" aria-label={`${title} country`}>
          <button type="button" className="ap-chip" aria-pressed={a.country === "NG"} onClick={() => set({ ...a, country: "NG", state: "", zip: "" })}>Nigeria</button>
          <button type="button" className="ap-chip" aria-pressed={a.country === "US"} onClick={() => set({ ...a, country: "US", state: "", zip: "" })}>USA</button>
        </div>
      )}
      <div className="doc-row">
        <div className="field"><label htmlFor={`${prefix}-name`}>Full name</label><input id={`${prefix}-name`} className="input" autoComplete="name" value={a.name} onChange={f("name")} /></div>
        <div className="field"><label htmlFor={`${prefix}-phone`}>Phone</label><input id={`${prefix}-phone`} className="input" type="tel" value={a.phone} onChange={f("phone")} placeholder={a.country === "US" ? "212 555 1234" : "0803 123 4567"} /></div>
      </div>
      <div className="field"><label htmlFor={`${prefix}-email`}>Email</label><input id={`${prefix}-email`} className="input" type="email" value={a.email} onChange={f("email")} /></div>
      <div className="field"><label htmlFor={`${prefix}-line1`}>Street address</label><input id={`${prefix}-line1`} className="input" value={a.line1} onChange={f("line1")} placeholder="House number and street" /></div>
      <div className="field"><label htmlFor={`${prefix}-line2`}>Apartment, landmark (optional)</label><input id={`${prefix}-line2`} className="input" value={a.line2} onChange={f("line2")} /></div>
      <div className="doc-row">
        <div className="field"><label htmlFor={`${prefix}-city`}>City</label><input id={`${prefix}-city`} className="input" value={a.city} onChange={f("city")} /></div>
        <div className="field"><label htmlFor={`${prefix}-state`}>State</label>
          {a.country === "NG"
            ? <select id={`${prefix}-state`} className="select" value={a.state} onChange={f("state")}><option value="">Choose…</option>{states.map((s) => <option key={s}>{s}</option>)}</select>
            : <input id={`${prefix}-state`} className="input" value={a.state} onChange={f("state")} placeholder="e.g. TX or Texas" />}
        </div>
        {a.country === "US" && <div className="field"><label htmlFor={`${prefix}-zip`}>ZIP code</label><input id={`${prefix}-zip`} className="input" inputMode="numeric" value={a.zip} onChange={f("zip")} /></div>}
      </div>
    </fieldset>
  );
}

/** "Send a Package": real pickup + delivery within Nigeria or from the USA to Nigeria, with tracking. */
export function SendPackage({ balance, onAddMoney }: { balance: number; onAddMoney: () => void }) {
  const router = useRouter();
  const { charge } = useCurrency();
  const [info, setInfo] = useState<Info | null>(null);
  const [from, setFrom] = useState<Addr>(blank("NG"));
  const [to, setTo] = useState<Addr>(blank("NG"));
  const [pkg, setPkg] = useState({ description: "", weightKg: "1", value: "", quantity: "1" });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [picked, setPicked] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const load = () => api<Info>("/api/shipping").then(setInfo).catch((e) => setMsg({ ok: false, text: (e as Error).message }));
  useEffect(() => { void load(); }, []);

  if (!info) return <section className="card glass">{msg ? <div className="form-error" role="alert">{msg.text}</div> : <p className="muted" role="status">Loading…</p>}</section>;
  const intl = from.country !== "NG";
  const rate = quote?.rates.find((r) => r.rateId === picked);

  async function getPrices() {
    setBusy(true); setMsg(null); setQuote(null); setPicked("");
    try {
      const q = await api<Quote>("/api/shipping", { action: "quote", input: { from, to: { ...to, country: "NG" }, ...pkg } });
      setQuote(q); setPicked(q.rates[0]?.rateId ?? "");
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  }
  async function book() {
    if (!quote || !rate) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ code: string }>("/api/shipping", { action: "book", quoteId: quote.quoteId, rateId: rate.rateId });
      setDone(r.code); setQuote(null); router.refresh(); await load();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  }
  async function cancel(s: Ship) {
    if (!window.confirm(`Cancel package ${s.code}? You get a full refund to your wallet.`)) return;
    try { await api("/api/shipping", { action: "cancel", id: s.id }); setMsg({ ok: true, text: "Cancelled. Your money is back in your wallet." }); router.refresh(); await load(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }

  return (
    <>
      {!info.enabled ? (
        <section className="card glass"><div className="empty">Package delivery opens soon. Check back shortly.</div></section>
      ) : done ? (
        <section className="card glass">
          <div className="form-ok" role="status">Booked! The courier will contact the sender to arrange pickup.</div>
          <p style={{ margin: 0 }}>Tracking number: <code className="ap-code bt-num">{done}</code> <Copy text={done} /></p>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Share it with the receiver. Anyone can follow the package at <Link href={`/track?code=${done}`}>almightypumps.com/track</Link>.</p>
          <button type="button" className="btn btn-ghost" onClick={() => { setDone(null); setPkg({ description: "", weightKg: "1", value: "", quantity: "1" }); }}>Send another package</button>
        </section>
      ) : (
        <section className="card glass" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2>Send/Receive a package</h2>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>Within Nigeria, or from the USA to Nigeria. A courier picks it up from the sender and delivers it to the receiver, with tracking the whole way.</p>
          <AddressFields prefix="sf" title="Pick up from (sender)" a={from} set={(a) => { setFrom(a); setQuote(null); }} states={info.states} />
          <AddressFields prefix="st" title="Deliver to (receiver, Nigeria)" a={to} set={(a) => { setTo(a); setQuote(null); }} states={info.states} lockCountry />
          <fieldset className="ap-subform" style={{ gap: 10, border: 0 }}>
            <legend style={{ fontWeight: 700, padding: 0, marginBottom: 6 }}>The package</legend>
            <div className="field"><label htmlFor="pk-desc">What&apos;s inside</label><input id="pk-desc" className="input" value={pkg.description} onChange={(e) => { setPkg({ ...pkg, description: e.target.value }); setQuote(null); }} placeholder="e.g. Clothes and shoes" /></div>
            <div className="doc-row">
              <div className="field"><label htmlFor="pk-w">Total weight (kg)</label><input id="pk-w" className="input" inputMode="decimal" value={pkg.weightKg} onChange={(e) => { setPkg({ ...pkg, weightKg: e.target.value }); setQuote(null); }} /></div>
              <div className="field"><label htmlFor="pk-v">Value ({intl ? "US$" : "₦"})</label><input id="pk-v" className="input" inputMode="decimal" value={pkg.value} onChange={(e) => { setPkg({ ...pkg, value: e.target.value }); setQuote(null); }} /></div>
              <div className="field"><label htmlFor="pk-q">Number of items</label><input id="pk-q" className="input" inputMode="numeric" value={pkg.quantity} onChange={(e) => { setPkg({ ...pkg, quantity: e.target.value }); setQuote(null); }} /></div>
            </div>
            {intl && <p className="muted" style={{ fontSize: 13, margin: 0 }}>International parcels go through Nigerian customs. Describe the contents honestly; import duty, if any, may be collected on delivery.</p>}
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>Not allowed: cash, weapons, drugs, fake or stolen goods, and anything illegal to send.</p>
          </fieldset>
          {!quote && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void getPrices()}>{busy ? "Getting prices from couriers…" : "See prices"}</button>}
          {quote && (
            <div className="field">
              <span style={{ fontWeight: 700 }}>Choose a courier</span>
              <ul className="ship-rates">
                {quote.rates.map((r) => (
                  <li key={r.rateId}>
                    <label className={`ship-rate${picked === r.rateId ? " on" : ""}`}>
                      <input type="radio" name="rate" checked={picked === r.rateId} onChange={() => setPicked(r.rateId)} />
                      {/* eslint-disable-next-line @next/next/no-img-element -- courier logo */}
                      {r.logo ? <img src={r.logo} alt="" width={36} height={36} /> : <span className="ship-rate-logo" aria-hidden="true">{r.carrier[0]}</span>}
                      <span className="ship-rate-main"><strong>{r.carrier}</strong><span className="muted">{[r.service, r.deliveryTime].filter(Boolean).join(" · ")}</span></span>
                      <strong>{charge(r.priceKobo)}</strong>
                    </label>
                  </li>
                ))}
              </ul>
              {rate && rate.priceKobo > balance ? (
                <><div className="form-error" role="alert">Your wallet balance is too low for this.</div><button type="button" className="btn btn-primary" onClick={onAddMoney}>Add money</button></>
              ) : (
                <button type="button" className="btn btn-primary" disabled={busy || !rate} onClick={() => void book()}>{busy ? "Booking…" : rate ? `Pay ${charge(rate.priceKobo)} and book pickup` : "Choose a courier"}</button>
              )}
              <button type="button" className="ap-link" style={{ alignSelf: "flex-start" }} onClick={() => setQuote(null)}>Change details</button>
            </div>
          )}
          {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
        </section>
      )}

      {info.shipments.length > 0 && (
        <section className="card glass">
          <h2>My packages</h2>
          <ul className="vc-history">
            {info.shipments.map((s) => {
              const st = SHIP_STATUS[s.status] ?? { label: s.status, tone: "" };
              return (
                <li key={s.id}>
                  <div><strong>{s.from} → {s.to}</strong> <span className="muted" style={{ fontSize: 13 }}>to {s.toName} · {s.carrier} · {new Date(s.bookedAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}</span></div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className={`status ${st.tone}`}>{st.label}</span>
                    <code className="ap-code">{s.code}</code> <Copy text={s.code} />
                    <Link href={`/track?code=${s.code}`} className="ap-link" style={{ fontSize: 13 }}>Track</Link>
                    {s.labelUrl && <a href={s.labelUrl} target="_blank" rel="noopener noreferrer" className="ap-link" style={{ fontSize: 13 }}>Shipping label</a>}
                    {s.canCancel && <button type="button" className="btn btn-ghost ap-mini" onClick={() => void cancel(s)}>Cancel</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
