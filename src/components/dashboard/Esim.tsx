"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { US_STATES, appleInstallUrl, checkImei, monthsLabel, splitLpa, usNumber } from "@/core/esim";
import { api } from "../api";
import { useCurrency } from "./Currency";

type Price = { id: string; dataLabel: string; months: number; price: number };
type Plan = { id: string; name: string; network: string; description: string; allowKeepNumber: boolean; keepNumberFee: number; data: string[]; prices: Price[] };
type Order = {
  id: string; publicId: number; label: string; amount: number; status: "pending" | "delivered" | "refunded"; numberMode: "new" | "keep"; usState?: string | null;
  keepNumber: string | null; phoneNumber: string | null; lpa: string | null; qr: string | null; note: string | null; refundReason: string | null;
  createdAt: string; imeiEnd: string;
};

const STATUS: Record<Order["status"], string> = { pending: "Being prepared", delivered: "Ready to install", refunded: "Refunded" };

function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn btn-ghost ap-mini" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* ignore */ } }}>
      {done ? "Copied" : label}
    </button>
  );
}

export function Esim({ balance, onAddMoney }: { balance: number; onAddMoney: () => void }) {
  const router = useRouter();
  const { money, charge } = useCurrency();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [planId, setPlanId] = useState("");
  const [data, setData] = useState("");
  const [priceId, setPriceId] = useState("");
  const [imei, setImei] = useState("");
  const [keep, setKeep] = useState(false);
  const [usState, setUsState] = useState("");
  const [port, setPort] = useState({ number: "", carrier: "", accountNumber: "", pin: "", zip: "", name: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadOrders = () => api<Order[]>("/api/esim/orders").then(setOrders).catch(() => {});
  useEffect(() => {
    api<Plan[]>("/api/esim/plans").then((p) => {
      setPlans(p);
      if (p[0]) { setPlanId(p[0].id); setData(p[0].data[0] ?? ""); }
    }).catch((e) => setError((e as Error).message));
    void loadOrders();
  }, []);

  const plan = plans?.find((p) => p.id === planId) ?? null;
  const options = useMemo(() => (plan ? plan.prices.filter((x) => x.dataLabel === data) : []), [plan, data]);
  useEffect(() => { setPriceId((cur) => (options.some((o) => o.id === cur) ? cur : options[0]?.id ?? "")); }, [options]);
  const chosen = options.find((o) => o.id === priceId) ?? null;
  const oneMonth = options.find((o) => o.months === 1);
  const total = chosen ? chosen.price + (keep && plan ? plan.keepNumberFee : 0) : 0;
  const imeiCheck = imei ? checkImei(imei) : null;
  const imeiOk = imeiCheck && "imei" in imeiCheck;
  const portOk = !keep || (usNumber(port.number) && port.carrier.trim().length >= 2 && port.accountNumber.trim() && port.pin.trim() && /^\d{5}$/.test(port.zip) && port.name.trim().length >= 2);
  const stateOk = keep || usState !== "";
  const short = total > balance ? total - balance : 0;
  const setP = (k: keyof typeof port) => (e: React.ChangeEvent<HTMLInputElement>) => setPort((x) => ({ ...x, [k]: e.target.value }));

  async function order() {
    if (!chosen || !plan) return;
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/esim/orders", keep ? { priceId: chosen.id, imei, numberMode: "keep", port } : { priceId: chosen.id, imei, numberMode: "new", state: usState });
      setMsg({ ok: true, text: `Order placed. ${charge(total)} is set aside from your wallet. We're preparing your eSIM; you'll find it below when it's ready.` });
      setImei("");
      setPort({ number: "", carrier: "", accountNumber: "", pin: "", zip: "", name: "" });
      setKeep(false);
      await loadOrders();
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {orders.length > 0 && (
        <section className="card glass">
          <h2>My eSIMs</h2>
          <ul className="es-orders">
            {orders.map((o) => <EsimOrder key={o.id} o={o} money={money} />)}
          </ul>
        </section>
      )}

      <PhoneCheck canOrder={Boolean(plan)} onUse={(v) => { setImei(v); document.getElementById("es-imei")?.scrollIntoView({ behavior: "smooth", block: "center" }); }} />

      <section className="card glass">
        <h2>Get a US eSIM</h2>
        {error && <div className="form-error" role="alert">{error}</div>}
        {!plans && !error && <p className="muted" role="status">Loading plans…</p>}
        {plans && plans.length === 0 && <div className="empty">eSIM plans are coming soon. Check back shortly.</div>}
        {plan && (
          <>
            {plans!.length > 1 && (
              <div className="ap-chips" role="group" aria-label="Plan">
                {plans!.map((p) => <button key={p.id} type="button" className="ap-chip" aria-pressed={p.id === planId} onClick={() => { setPlanId(p.id); setData(p.data[0] ?? ""); setKeep(false); }}>{p.name}</button>)}
              </div>
            )}
            {(plan.network || plan.description) && <p className="muted" style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{[plan.network, plan.description].filter(Boolean).join(" · ")}</p>}

            <div className="es-step"><span className="es-num">1</span><strong>Choose your data</strong></div>
            <div className="es-data" role="group" aria-label="Data">
              {plan.data.map((d) => <button key={d} type="button" className="es-data-btn" aria-pressed={d === data} onClick={() => setData(d)}>{d}</button>)}
            </div>
            <div className="es-durations" role="radiogroup" aria-label="Plan length">
              {options.map((o) => {
                const perMonth = Math.round(o.price / o.months);
                const save = oneMonth && o.months > 1 ? Math.round((1 - perMonth / oneMonth.price) * 100) : 0;
                return (
                  <button key={o.id} type="button" role="radio" aria-checked={o.id === priceId} className="es-duration" onClick={() => setPriceId(o.id)}>
                    {save > 0 && <span className="es-save">−{save}%</span>}
                    <strong>{monthsLabel(o.months)}</strong>
                    <span className="es-price"><b>{money(perMonth)}</b>/mo<br /><span className="muted">{money(o.price)} upfront</span></span>
                  </button>
                );
              })}
            </div>

            <div className="es-step"><span className="es-num">2</span><strong>Your phone</strong></div>
            <p className="muted" style={{ fontSize: 13 }}>Your phone must support eSIM and be unlocked. The eSIM only activates on the exact phone whose IMEI you enter.</p>
            <div className="field">
              <label htmlFor="es-imei">IMEI number (14–16 digits)</label>
              <input id="es-imei" className="input" inputMode="numeric" autoComplete="off" value={imei} onChange={(e) => setImei(e.target.value.replace(/[^\d\s-]/g, ""))} placeholder="Dial *#06# to see it" />
              {imeiCheck && "error" in imeiCheck && imei.replace(/\D/g, "").length >= 14 && <span className="form-error" role="alert" style={{ padding: "6px 10px" }}>{imeiCheck.error}</span>}
              <a className="ap-link" href="tel:*%2306%23" style={{ fontSize: 13 }}>Dial *#06# to get your IMEI</a>
            </div>

            <div className="es-step"><span className="es-num">3</span><strong>Your phone number</strong></div>
            {plan.allowKeepNumber ? (
              <label className="ap-toggle"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /><span>Keep my existing US number{plan.keepNumberFee ? ` (+${money(plan.keepNumberFee)})` : ""}</span></label>
            ) : null}
            {!keep ? (
              <div className="field">
                <label htmlFor="es-state">Which US state do you want your number from?</label>
                <select id="es-state" className="input" value={usState} onChange={(e) => setUsState(e.target.value)}>
                  <option value="">Choose a state</option>
                  {US_STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                </select>
                <span className="muted" style={{ fontSize: 13 }}>You&apos;ll get a new US phone number with that state&apos;s area code. If none is free there, we&apos;ll use the nearest one.</span>
              </div>
            ) : (
              <div className="ap-subform" style={{ gap: 10 }}>
                <p className="muted" style={{ fontSize: 13 }}>We move your number from your current carrier. Get these from your carrier&apos;s app or customer care. Don&apos;t cancel your old line until the new eSIM works.</p>
                <div className="field"><label htmlFor="es-pn">Number to keep</label><input id="es-pn" className="input" inputMode="tel" value={port.number} onChange={setP("number")} placeholder="(312) 555-0123" /></div>
                <div className="field"><label htmlFor="es-pc">Current carrier</label><input id="es-pc" className="input" value={port.carrier} onChange={setP("carrier")} placeholder="e.g. T-Mobile" /></div>
                <div className="field"><label htmlFor="es-pa">Account number with that carrier</label><input id="es-pa" className="input" value={port.accountNumber} onChange={setP("accountNumber")} autoComplete="off" /></div>
                <div className="field"><label htmlFor="es-pp">Transfer / port-out PIN</label><input id="es-pp" className="input" value={port.pin} onChange={setP("pin")} autoComplete="off" /></div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <div className="field" style={{ flex: "1 1 120px" }}><label htmlFor="es-pz">Billing ZIP code</label><input id="es-pz" className="input" inputMode="numeric" maxLength={5} value={port.zip} onChange={setP("zip")} /></div>
                  <div className="field" style={{ flex: "2 1 200px" }}><label htmlFor="es-pnm">Account holder&apos;s name</label><input id="es-pnm" className="input" value={port.name} onChange={setP("name")} /></div>
                </div>
                <p className="muted" style={{ fontSize: 12 }}>🔒 These details are stored encrypted and deleted once your eSIM is delivered.</p>
              </div>
            )}

            {chosen && (
              <div className="ap-total"><span>Total</span><strong>{charge(total)}</strong></div>
            )}
            <p className="muted" style={{ fontSize: 13 }}>The money is set aside when you order and only taken when your eSIM is delivered. If we can&apos;t deliver it, you get a full refund.</p>
            {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
            {short > 0 ? (
              <>
                <div className="form-error" role="alert">Your balance is {charge(balance)}. Add {charge(short)} more.</div>
                <button type="button" className="btn btn-primary" onClick={onAddMoney}>Add money</button>
              </>
            ) : (
              <button type="button" className="btn btn-primary" disabled={busy || !chosen || !imeiOk || !portOk || !stateOk} onClick={() => void order()}>
                {busy ? "Placing order…" : chosen ? `Order eSIM for ${charge(total)}` : "Choose a plan"}
              </button>
            )}
            {chosen && (!imeiOk || !portOk || !stateOk) && <p className="muted" style={{ fontSize: 12 }}>{!imeiOk ? "Enter a valid IMEI to continue." : !stateOk ? "Choose the US state for your number." : "Fill in all the details for keeping your number."}</p>}
          </>
        )}
      </section>
    </>
  );
}

function EsimOrder({ o, money }: { o: Order; money: (k: number) => string }) {
  const [open, setOpen] = useState(o.status === "delivered");
  const parts = o.lpa ? splitLpa(o.lpa) : null;
  return (
    <li className="es-order">
      <button type="button" className="es-order-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span style={{ minWidth: 0 }}><strong>{o.label}</strong><br /><span className="muted" style={{ fontSize: 13 }}>#E-{o.publicId} · {new Date(o.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" })} · phone IMEI …{o.imeiEnd}</span></span>
        <span className={`ap-tag${o.status === "delivered" ? " ok" : ""}`}>{STATUS[o.status]}</span>
      </button>
      {open && (
        <div className="es-order-body">
          {o.status === "pending" && <p className="muted" style={{ fontSize: 14 }}>We&apos;re setting up your eSIM{o.numberMode === "keep" && o.keepNumber ? ` and moving ${o.keepNumber}` : o.usState ? ` with a ${o.usState} number` : ""}. You&apos;ll see the QR code here when it&apos;s ready. {money(o.amount)} is set aside, not yet charged.</p>}
          {o.status === "refunded" && <div className="form-ok" role="status">{money(o.amount)} was returned to your wallet.{o.refundReason ? ` Reason: ${o.refundReason}` : ""}</div>}
          {o.status === "delivered" && (
            <>
              {o.phoneNumber && <div className="vc-number"><span>{o.phoneNumber}</span><Copy text={o.phoneNumber} label="Copy number" /></div>}
              {o.qr && (
                <div className="es-qr">
                  {/* eslint-disable-next-line @next/next/no-img-element -- generated QR data URL */}
                  <img src={o.qr} alt="eSIM QR code" width={220} height={220} />
                  <p className="muted" style={{ fontSize: 13 }}>Scan this from <b>another</b> screen: Settings → Mobile/Cellular → Add eSIM → Use QR code.</p>
                </div>
              )}
              {o.lpa && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <a className="btn btn-primary ap-mini" href={appleInstallUrl(o.lpa)} target="_blank" rel="noreferrer">Install on this iPhone</a>
                  <Copy text={o.lpa} label="Copy activation code" />
                </div>
              )}
              {parts && (
                <dl className="ap-facts">
                  <dt>SM-DP+ address</dt><dd><code className="ap-code">{parts.smdp}</code> <Copy text={parts.smdp} /></dd>
                  {parts.code && <><dt>Activation code</dt><dd><code className="ap-code">{parts.code}</code> <Copy text={parts.code} /></dd></>}
                </dl>
              )}
              {o.note && <p style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{o.note}</p>}
              <InstallGuide imeiEnd={o.imeiEnd} />
            </>
          )}
        </div>
      )}
    </li>
  );
}

/** How to install the eSIM, shown with every delivered order. */
function InstallGuide({ imeiEnd }: { imeiEnd: string }) {
  return (
    <div className="es-guide">
      <div className="es-guide-warn" role="note">
        <strong>Important</strong>
        <ul>
          <li>This eSIM only activates on the phone whose IMEI ends in <b>{imeiEnd}</b>.</li>
          <li>Install it <b>once</b>. Don&apos;t remove or delete the eSIM, and don&apos;t download it again.</li>
          <li>Any problem installing or with service? Tap <b>Help</b> and message us straight away, before trying again.</li>
        </ul>
      </div>
      <details open>
        <summary>Install on iPhone</summary>
        <ol>
          <li>Open <b>Settings</b> → <b>Cellular</b> (or Mobile Service).</li>
          <li>Tap <b>Add eSIM</b>.</li>
          <li>Pick the plan if your phone already shows it, or choose <b>Use QR Code</b> and scan the code above from another screen. On this iPhone you can also tap “Install on this iPhone”.</li>
          <li>Follow the steps on the phone and choose this line as your primary network.</li>
          <li>Internet settings (APN): on iOS 17 or newer, open the eSIM in Cellular settings and turn on <b>Carrier Settings</b>. On iOS 16 or older, message us in Help for the APN profile. Without this step you may have no service.</li>
        </ol>
      </details>
      <details>
        <summary>Install on Android</summary>
        <ol>
          <li>Open <b>Settings</b> → <b>Network &amp; Internet</b> (Connections on Samsung).</li>
          <li>Open <b>SIM manager</b> / SIMs and tap <b>Add eSIM</b>.</li>
          <li>Pick the plan if your phone already shows it, or scan the QR code above from another screen.</li>
          <li>Follow the steps on the phone and turn the eSIM on.</li>
          <li>Internet settings (APN): message us in Help for the APN settings and enter them under Access Point Names. Without this step you may have no service.</li>
        </ol>
      </details>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>Outside the US? Turn on Data Roaming for this eSIM.</p>
    </div>
  );
}

type Check = { id: string; publicId: number; imei: string; status: "pending" | "compatible" | "incompatible"; note: string | null; createdAt: string; again?: boolean };
const CHECK: Record<Check["status"], { label: string; tone: string }> = {
  pending: { label: "With our team", tone: "info" }, compatible: { label: "Works", tone: "ok" }, incompatible: { label: "Doesn't work", tone: "bad" },
};

/** Free: ask us to check a phone before paying anything. No wallet balance needed. */
function PhoneCheck({ onUse, canOrder }: { onUse: (imei: string) => void; canOrder: boolean }) {
  const [list, setList] = useState<Check[]>([]);
  const [imei, setImei] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => api<Check[]>("/api/esim/imei-check").then(setList).catch(() => {});
  const waiting = list.some((c) => c.status === "pending");
  useEffect(() => { void load(); }, []);
  // While a phone is being checked, look for the answer every minute.
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60_000);
    return () => clearInterval(t);
  }, [waiting]);
  const v = imei ? checkImei(imei) : null;
  const ok = v && "imei" in v;

  async function send() {
    setBusy(true); setMsg(null);
    try {
      const c = await api<Check>("/api/esim/imei-check", { imei });
      setImei("");
      setMsg({ ok: c.status !== "incompatible", text: c.status === "pending"
        ? (c.again ? "We're already checking this phone. You'll get an email as soon as we have the answer." : "Sent. We'll check this phone and email you the answer, usually within a few hours. It's free.")
        : c.status === "compatible" ? "Good news: this phone works with our US eSIM." : `Sorry, this phone won't work with our US eSIM.${c.note ? ` ${c.note}` : ""}` });
      await load();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  return (
    <section className="card glass">
      <h2>Check my phone first (free)</h2>
      <p className="muted" style={{ fontSize: 14, margin: 0 }}>Not sure your phone will work? Send us its IMEI and we&apos;ll check it before you pay anything. You don&apos;t need money in your wallet.</p>
      <div className="field">
        <label htmlFor="pc-imei">IMEI number (14–16 digits)</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input id="pc-imei" className="input" style={{ flex: "1 1 200px" }} inputMode="numeric" autoComplete="off" value={imei} onChange={(e) => setImei(e.target.value.replace(/[^\d\s-]/g, ""))} placeholder="e.g. 35 123456 789012 3" />
          <button type="button" className="btn btn-primary" disabled={busy || !ok} onClick={() => void send()}>{busy ? "Sending…" : "Check my phone"}</button>
        </div>
        {v && "error" in v && imei.replace(/\D/g, "").length >= 14 && <span className="form-error" role="alert" style={{ padding: "6px 10px" }}>{v.error}</span>}
        <a className="ap-link" href="tel:*%2306%23" style={{ fontSize: 13 }}>Dial *#06# to get your IMEI</a>
      </div>
      {msg && <div className={msg.ok ? "form-ok" : "form-error"} role="status">{msg.text}</div>}
      {list.length > 0 && (
        <ul className="ap-list">
          {list.map((c) => (
            <li key={c.id} className="ap-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}><div className="ap-row-title selectable">IMEI {c.imei}</div><div className="muted ap-row-sub">Sent {new Date(c.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</div></div>
                <span className={`status ${CHECK[c.status].tone}`}>{CHECK[c.status].label}</span>
              </div>
              {c.status === "pending" && <div className="muted ap-row-sub">Sent to our team. You&apos;ll get the answer by email, usually within a few hours.</div>}
              {c.note && <div className="ap-row-sub">{c.note}</div>}
              {c.status === "compatible" && canOrder && <div><button type="button" className="btn btn-ghost ap-mini" onClick={() => onUse(c.imei)}>Order for this phone</button></div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
