"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useCurrency } from "./Currency";
import { Copy } from "./instantUi";

type Card = { id: string; name: string; currency: string; physicalRateKobo: number; ecodeRateKobo: number; min: number; max: number; note: string };
type Coin = { id: string; coin: string; network: string; address: string; rateKobo: number; min: number; note: string; stable: boolean; qr: string };
type Trade = { id: string; publicId: number; kind: "giftcard" | "crypto"; item: string; value: number; currency: string; payoutKobo: number; status: "pending" | "paid" | "rejected"; paidKobo: number | null; reason: string | null; createdAt: string };
type Data = { enabled: boolean; dailyLimitKobo: number; cards: Card[]; coins: Coin[]; trades: Trade[] };

const STATUS = { pending: "Being checked", paid: "Paid to wallet", rejected: "Not accepted" } as const;
const money0 = (n: number, cur: string) => { try { return new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(n); } catch { return `${n} ${cur}`; } };

/** Shrink a photo in the browser (max 1600px, JPEG) so uploads stay small. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.82, 0.7, 0.55]) { const d = c.toDataURL("image/jpeg", q); if (d.length < 650_000) return d; }
    return c.toDataURL("image/jpeg", 0.45);
  } finally { URL.revokeObjectURL(url); }
}

export function SellDesk() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"giftcard" | "crypto">("giftcard");
  const load = () => api<Data>("/api/sell").then(setData).catch((e) => setError((e as Error).message));
  useEffect(() => { void load(); }, []);

  if (error) return <section className="card glass"><div className="form-error" role="alert">{error}</div></section>;
  if (!data) return <section className="card glass"><p className="muted" role="status">Loading…</p></section>;

  return (
    <>
      <div className="ap-chips" role="group" aria-label="What to sell">
        <button type="button" className="ap-chip" aria-pressed={tab === "giftcard"} onClick={() => setTab("giftcard")}>Sell gift cards</button>
        <button type="button" className="ap-chip" aria-pressed={tab === "crypto"} onClick={() => setTab("crypto")}>Sell crypto</button>
      </div>
      {!data.enabled ? (
        <section className="card glass"><div className="empty">Selling opens soon. Check back shortly.</div></section>
      ) : tab === "giftcard" ? <SellCards cards={data.cards} onDone={load} /> : <SellCrypto coins={data.coins} onDone={load} />}
      {data.trades.length > 0 && (
        <section className="card glass">
          <h2>My sales</h2>
          <ul className="vc-history">
            {data.trades.map((t) => (
              <li key={t.id}>
                <div><strong>{t.item}</strong> <span className="muted" style={{ fontSize: 13 }}>{money0(t.value, t.currency)} · #S-{t.publicId} · {new Date(t.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</span></div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className={`ap-tag${t.status === "paid" ? " ok" : ""}`}>{STATUS[t.status]}</span>
                  <Payout t={t} />
                  {t.reason && <span className="muted" style={{ fontSize: 13 }}>Reason: {t.reason}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Payout({ t }: { t: Trade }) {
  const { money } = useCurrency();
  if (t.status === "paid") return <span className="muted" style={{ fontSize: 13 }}>+{money(t.paidKobo ?? t.payoutKobo)}</span>;
  if (t.status === "pending") return <span className="muted" style={{ fontSize: 13 }}>You get {money(t.payoutKobo)}</span>;
  return null;
}

function SellCards({ cards, onDone }: { cards: Card[]; onDone: () => void }) {
  const router = useRouter();
  const { money, charge } = useCurrency();
  const [q, setQ] = useState("");
  const [cardId, setCardId] = useState("");
  const [form, setForm] = useState<"ecode" | "physical">("physical");
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const list = useMemo(() => cards.filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase())), [cards, q]);
  const card = cards.find((c) => c.id === cardId) ?? null;
  useEffect(() => { if (card) setForm(card.physicalRateKobo ? "physical" : "ecode"); }, [card]);

  if (cards.length === 0) return <section className="card glass"><div className="empty">We&apos;re not buying gift cards right now. Check back soon.</div></section>;
  const rate = card ? (form === "ecode" ? card.ecodeRateKobo : card.physicalRateKobo) : 0;
  const v = Number(value);
  const valueOk = card ? v >= card.min && v <= card.max : false;
  const pay = valueOk ? Math.floor(v * rate) : 0;
  const ready = valueOk && rate > 0 && (form === "ecode" ? code.trim().length >= 4 : images.length > 0);

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const out: string[] = [];
    for (const f of Array.from(files).slice(0, 4 - images.length)) out.push(await shrink(f));
    setImages((x) => [...x, ...out].slice(0, 4));
  }

  async function submit() {
    if (!card) return;
    setBusy(true); setMsg(null);
    try {
      await api("/api/sell", { kind: "giftcard", itemId: card.id, form, value: v, code, note, images });
      setMsg({ ok: true, text: `Sent! We're checking your ${card.name}. ${charge(pay)} goes to your wallet once it's confirmed, and we'll email you.` });
      setValue(""); setCode(""); setNote(""); setImages([]);
      onDone(); router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally { setBusy(false); }
  }

  return (
    <section className="card glass">
      <h2>Sell a gift card</h2>
      {!card ? (
        <>
          <p className="muted" style={{ fontSize: 14 }}>Pick your card to see today&apos;s rate.</p>
          {cards.length > 6 && (
            <div className="ap-search">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input type="search" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: Amazon, iTunes, Steam…" aria-label="Search cards" />
            </div>
          )}
          <ul className="ap-services">
            {list.map((c) => (
              <li key={c.id}>
                <button type="button" className="ap-service" onClick={() => { setCardId(c.id); setMsg(null); }}>
                  <span className="ap-service-main"><span className="ap-service-name">{c.name}</span><span className="ap-service-meta muted" style={{ fontSize: 12 }}>{money0(c.min, c.currency)} – {money0(c.max, c.currency)}</span></span>
                  <span className="ap-service-price">{money(Math.max(c.physicalRateKobo, c.ecodeRateKobo))}<span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>/{c.currency === "USD" ? "$1" : `1 ${c.currency}`}</span></span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <button type="button" className="ap-link" style={{ alignSelf: "flex-start" }} onClick={() => { setCardId(""); setMsg(null); }}>← All cards</button>
          <strong style={{ fontSize: 18 }}>{card.name}</strong>
          {card.note && <p className="muted" style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{card.note}</p>}
          {card.physicalRateKobo > 0 && card.ecodeRateKobo > 0 && (
            <div className="ap-chips" role="group" aria-label="Card type">
              <button type="button" className="ap-chip" aria-pressed={form === "physical"} onClick={() => { setForm("physical"); setMsg(null); }}>Physical card <span>{money(card.physicalRateKobo)}</span></button>
              <button type="button" className="ap-chip" aria-pressed={form === "ecode"} onClick={() => { setForm("ecode"); setMsg(null); }}>E-code <span>{money(card.ecodeRateKobo)}</span></button>
            </div>
          )}
          <div className="field">
            <label htmlFor="sd-value">Card value ({card.currency}, {card.min}–{card.max})</label>
            <input id="sd-value" className="input" inputMode="decimal" value={value} onChange={(e) => { setValue(e.target.value.replace(/[^\d.]/g, "")); setMsg(null); }} placeholder={`e.g. ${Math.min(card.max, 100)}`} />
          </div>
          {pay > 0 && <div className="ap-total"><span>You get</span><strong>{charge(pay)}</strong></div>}
          <p className="muted" style={{ fontSize: 12 }}>Rate: {money(rate)} per {card.currency === "USD" ? "$1" : `1 ${card.currency}`}.</p>
          {form === "ecode" && (
            <div className="field">
              <label htmlFor="sd-code">Gift card code</label>
              <input id="sd-code" className="input" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} />
            </div>
          )}
          <div className="field">
            <label htmlFor="sd-photos">{form === "physical" ? "Photos of the card (front, and back with the code scratched)" : "Screenshot (optional)"}</label>
            <input id="sd-photos" type="file" accept="image/*" multiple className="input" onChange={(e) => void addPhotos(e.target.files)} disabled={images.length >= 4} />
            {images.length > 0 && (
              <div className="sd-thumbs">
                {images.map((src, i) => (
                  <span key={i} className="sd-thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                    <img src={src} alt={`Photo ${i + 1}`} />
                    <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setImages((x) => x.filter((_, k) => k !== i))}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="field">
            <label htmlFor="sd-note">Anything we should know? (optional)</label>
            <input id="sd-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 2 cards of $50, receipt available" />
          </div>
          {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
          <button type="button" className="btn btn-primary" disabled={busy || !ready} onClick={() => void submit()}>{busy ? "Sending…" : pay ? `Sell for ${charge(pay)}` : "Enter the card value"}</button>
          <p className="muted" style={{ fontSize: 12 }}>Only sell cards you bought yourself. Stolen, used or invalid cards are rejected and can get your account closed. Payment goes to your wallet after we confirm the card, usually within an hour (9am–9pm).</p>
        </>
      )}
    </section>
  );
}

function SellCrypto({ coins, onDone }: { coins: Coin[]; onDone: () => void }) {
  const router = useRouter();
  const { money, charge } = useCurrency();
  const [coinId, setCoinId] = useState(coins[0]?.id ?? "");
  const [usd, setUsd] = useState("");
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (coins.length === 0) return <section className="card glass"><div className="empty">We&apos;re not buying crypto right now. Check back soon.</div></section>;
  const c = coins.find((x) => x.id === coinId) ?? coins[0];
  const v = Number(usd);
  const ok = v >= c.min;
  const pay = ok ? Math.floor(v * c.rateKobo) : 0;

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      await api("/api/sell", { kind: "crypto", itemId: c.id, value: v, txHash: hash });
      setMsg({ ok: true, text: `Got it! Once your ${c.coin} arrives, ${charge(pay)} goes to your wallet. We'll email you.` });
      setUsd(""); setHash(""); onDone(); router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally { setBusy(false); }
  }

  return (
    <section className="card glass">
      <h2>Sell crypto</h2>
      <div className="ap-chips ap-chips-wrap" role="group" aria-label="Coin">
        {coins.map((x) => <button key={x.id} type="button" className="ap-chip" aria-pressed={x.id === c.id} onClick={() => { setCoinId(x.id); setMsg(null); }}>{x.coin} <span>{x.network}</span></button>)}
      </div>
      <p className="muted" style={{ fontSize: 14 }}>Our rate: <b>{money(c.rateKobo)}</b> per $1 of {c.coin}.</p>
      <div className="field">
        <label htmlFor="sc-usd">How much are you sending? (in US$, minimum ${c.min})</label>
        <input id="sc-usd" className="input" inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 100" />
      </div>
      {pay > 0 && <div className="ap-total"><span>You get</span><strong>{charge(pay)}</strong></div>}
      {ok && (
        <div className="mp-box">
          <div className="es-step"><span className="es-num">1</span><strong>Send {c.stable ? `${v.toFixed(2)} ${c.coin}` : `$${v.toFixed(2)} worth of ${c.coin}`}</strong></div>
          <dl className="ap-facts">
            <dt>Network</dt><dd><b>{c.network}</b></dd>
            <dt>Address</dt><dd><code className="ap-code">{c.address}</code> <Copy text={c.address} /></dd>
          </dl>
          <div className="es-qr">
            {/* eslint-disable-next-line @next/next/no-img-element -- generated QR */}
            <img src={c.qr} alt={`${c.coin} address QR code`} width={170} height={170} />
          </div>
          <div className="form-error" role="note" style={{ fontSize: 13 }}>Send only {c.coin} on the <b>{c.network}</b> network. Anything else is lost. We pay for what actually arrives, after network fees.</div>
          {c.note && <p style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{c.note}</p>}
          <div className="es-step"><span className="es-num">2</span><strong>Paste your transaction hash</strong></div>
          <div className="field">
            <label htmlFor="sc-hash">Transaction hash (TXID)</label>
            <input id="sc-hash" className="input" autoComplete="off" spellCheck={false} value={hash} onChange={(e) => setHash(e.target.value)} placeholder="From your wallet's transaction details" />
          </div>
          {msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
          <button type="button" className="btn btn-primary" disabled={busy || hash.trim().length < 10} onClick={() => void submit()}>{busy ? "Sending…" : "I have sent it"}</button>
          <p className="muted" style={{ fontSize: 12 }}>Only tap this after sending. We pay once the transaction confirms, usually within an hour (9am–9pm).</p>
        </div>
      )}
      {!ok && msg && <div className={msg.ok ? "form-ok" : "form-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
    </section>
  );
}
