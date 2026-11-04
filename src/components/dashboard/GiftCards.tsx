"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useCurrency } from "./Currency";
import { BalanceGate, Copy, Sheet, countryName, flag, statusTone, usePollPending, type Status } from "./instantUi";

type Product = {
  id: number; name: string; brand: string; country: string; currency: string; logo: string | null; featured: boolean;
  values: { value: number; priceKobo: number }[];
  range: { min: number; max: number; minPriceKobo: number; maxPriceKobo: number } | null;
};
type Catalog = { countries: { code: string; products: number }[]; products: Product[] };
type Card = { cardNumber: string | null; pinCode: string | null; redemptionUrl?: string | null };
type Order = { id: string; publicId: number; name: string; country: string; value: number; currency: string; priceKobo: number; status: Status; codes: Card[]; redeem: string | null; createdAt: string };

const PAGE = 30;
const STATUS: Record<Status, string> = { pending: "Delivering…", delivered: "Delivered", refunded: "Refunded", failed: "Not charged" };
const fmtValue = (v: number, cur: string) => {
  try { return new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: v % 1 ? 2 : 0 }).format(v); } catch { return `${v} ${cur}`; }
};

export function GiftCards({ balance, onAddMoney }: { balance: number; onAddMoney: () => void }) {
  const router = useRouter();
  const { money } = useCurrency();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [country, setCountry] = useState<string>("");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [picked, setPicked] = useState<Product | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    api<Catalog>("/api/gift-cards").then((c) => { setCatalog(c); setCountry((cur) => cur || (c.countries.find((x) => x.code === "US") ?? c.countries[0])?.code || ""); }).catch((e) => setError((e as Error).message));
    api<Order[]>("/api/gift-cards/orders").then(setOrders).catch(() => {});
  }, []);

  const update = useCallback((o: Order) => setOrders((all) => [o, ...all.filter((x) => x.id !== o.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt))), []);
  usePollPending(orders, (id) => `/api/gift-cards/orders/${id}`, update, () => router.refresh());

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (catalog?.products ?? []).filter((p) => (!country || p.country === country) && (!s || p.name.toLowerCase().includes(s) || p.brand.toLowerCase().includes(s)));
  }, [catalog, country, q]);

  return (
    <>
      {orders.length > 0 && (
        <section className="card glass">
          <h2>My gift cards</h2>
          <ul className="es-orders">{orders.map((o) => <GiftOrder key={o.id} o={o} money={money} />)}</ul>
        </section>
      )}
      <section className="card glass">
        <h2>Buy a gift card</h2>
        <p className="muted" style={{ fontSize: 14 }}>Official digital gift cards, delivered to this page in seconds. Pay from your wallet.</p>
        {catalog && catalog.countries.length > 1 && (
          <div className="ap-chips" role="group" aria-label="Country">
            {catalog.countries.map((c) => (
              <button key={c.code} type="button" className="ap-chip" aria-pressed={c.code === country} onClick={() => { setCountry(c.code); setShown(PAGE); }}>
                {flag(c.code)} {countryName(c.code)} <span>{c.products}</span>
              </button>
            ))}
          </div>
        )}
        <div className="ap-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" className="input" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder="Search: Amazon, iTunes, Steam, PlayStation…" aria-label="Search gift cards" autoComplete="off" />
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        {!catalog && !error && <p className="muted" role="status">Loading gift cards…</p>}
        {catalog && list.length === 0 && <div className="empty">No gift card matches{q ? ` “${q}”` : ""}.</div>}
        <ul className="gc-grid">
          {list.slice(0, shown).map((p) => {
            const from = p.values[0]?.priceKobo ?? p.range?.minPriceKobo ?? 0;
            return (
              <li key={p.id}>
                <button type="button" className="gc-card" onClick={() => setPicked(p)}>
                  {p.logo
                    // eslint-disable-next-line @next/next/no-img-element -- provider logo
                    ? <img src={p.logo} alt="" loading="lazy" width={160} height={100} />
                    : <span className="gc-logo-fallback" aria-hidden="true">{p.brand.slice(0, 1)}</span>}
                  <span className="gc-name">{p.name}</span>
                  <span className="muted gc-from">from {money(from)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {list.length > shown && <button type="button" className="btn btn-ghost" onClick={() => setShown((n) => n + PAGE)}>Show more ({list.length - shown} left)</button>}
      </section>
      {picked && (
        <BuyGift p={picked} balance={balance} onClose={() => setPicked(null)} onAddMoney={() => { setPicked(null); onAddMoney(); }}
          onBought={(o) => { setPicked(null); update(o); router.refresh(); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      )}
    </>
  );
}

function BuyGift({ p, balance, onClose, onAddMoney, onBought }: { p: Product; balance: number; onClose: () => void; onAddMoney: () => void; onBought: (o: Order) => void }) {
  const { charge } = useCurrency();
  const [value, setValue] = useState<number | null>(p.values[0]?.value ?? null);
  const [amount, setAmount] = useState(p.range ? String(p.range.min) : "");
  const [price, setPrice] = useState<number | null>(p.values[0]?.priceKobo ?? null);
  const [redeem, setRedeem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = p.range ? Number(amount) : value;

  // Exact price (and how to redeem) from the server for the chosen value.
  useEffect(() => {
    if (!chosen || !(chosen > 0)) { setPrice(null); return; }
    if (p.range && (chosen < p.range.min || chosen > p.range.max)) { setPrice(null); return; }
    let live = true;
    const t = setTimeout(() => {
      api<{ priceKobo: number; redeem: string | null }>(`/api/gift-cards/quote?productId=${p.id}&value=${chosen}`)
        .then((r) => { if (live) { setPrice(r.priceKobo); setRedeem(r.redeem); setError(null); } })
        .catch((e) => { if (live) { setPrice(null); setError((e as Error).message); } });
    }, p.range ? 400 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [p.id, p.range, chosen]);

  async function buy() {
    if (!chosen || price === null) return;
    setBusy(true); setError(null);
    try {
      onBought(await api<Order>("/api/gift-cards", { productId: p.id, value: chosen, priceKobo: price }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={p.name} kicker={`Gift card · ${countryName(p.country)}`} onClose={onClose}>
      {p.values.length > 0 && (
        <div className="es-data" role="group" aria-label="Card value">
          {p.values.map((v) => <button key={v.value} type="button" className="es-data-btn" aria-pressed={v.value === value} onClick={() => { setValue(v.value); setPrice(v.priceKobo); }}>{fmtValue(v.value, p.currency)}</button>)}
        </div>
      )}
      {p.range && (
        <div className="field">
          <label htmlFor="gc-amount">Card value ({p.currency}, {fmtValue(p.range.min, p.currency)} – {fmtValue(p.range.max, p.currency)})</label>
          <input id="gc-amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
        </div>
      )}
      {price !== null && <div className="ap-total"><span>You pay</span><strong>{charge(price)}</strong></div>}
      <p className="muted" style={{ fontSize: 13 }}>The code shows on this page as soon as it&apos;s ready (usually seconds). If it can&apos;t be delivered, you&apos;re refunded. Codes can&apos;t be returned once shown.</p>
      {redeem && <details className="ap-subform" style={{ fontSize: 13 }}><summary style={{ cursor: "pointer" }}><b>How to redeem</b></summary><p style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>{redeem}</p></details>}
      {error && <div className="form-error" role="alert">{error}</div>}
      {price !== null && (
        <BalanceGate price={price} balance={balance} onAddMoney={onAddMoney} charge={charge}>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void buy()}>{busy ? "Buying…" : `Buy for ${charge(price)}`}</button>
        </BalanceGate>
      )}
    </Sheet>
  );
}

function GiftOrder({ o, money }: { o: Order; money: (k: number) => string }) {
  const [open, setOpen] = useState(o.status !== "refunded" && o.status !== "failed");
  const [shown, setShown] = useState(false);
  return (
    <li className="es-order">
      <button type="button" className="es-order-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span style={{ minWidth: 0 }}><strong>{o.name} · {fmtValue(o.value, o.currency)}</strong><br /><span className="muted" style={{ fontSize: 13 }}>#G-{o.publicId} · {new Date(o.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" })} · {money(o.priceKobo)}</span></span>
        <span className={`ap-tag${statusTone(o.status)}`}>{STATUS[o.status]}</span>
      </button>
      {open && (
        <div className="es-order-body">
          {o.status === "pending" && <div className="vc-wait"><span className="vc-dot" aria-hidden="true" /> Getting your code…</div>}
          {(o.status === "refunded" || o.status === "failed") && <div className="form-ok" role="status">This card couldn&apos;t be delivered, so you weren&apos;t charged.</div>}
          {o.status === "delivered" && !shown && <button type="button" className="btn btn-primary ap-mini" style={{ alignSelf: "flex-start" }} onClick={() => setShown(true)}>Show code</button>}
          {o.status === "delivered" && shown && o.codes.map((c, i) => (
            <dl key={i} className="ap-facts">
              {c.cardNumber && <><dt>Code</dt><dd><code className="ap-code">{c.cardNumber}</code> <Copy text={c.cardNumber} /></dd></>}
              {c.pinCode && <><dt>PIN</dt><dd><code className="ap-code">{c.pinCode}</code> <Copy text={c.pinCode} /></dd></>}
              {c.redemptionUrl && /^https:\/\//.test(c.redemptionUrl) && <><dt>Link</dt><dd><a href={c.redemptionUrl} target="_blank" rel="noreferrer">Open redemption page ↗</a></dd></>}
            </dl>
          ))}
          {o.status === "delivered" && o.redeem && <details style={{ fontSize: 13 }}><summary style={{ cursor: "pointer" }}>How to redeem</summary><p style={{ whiteSpace: "pre-wrap" }}>{o.redeem}</p></details>}
        </div>
      )}
    </li>
  );
}
