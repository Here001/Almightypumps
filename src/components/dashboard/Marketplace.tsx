"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import { useCurrency } from "./Currency";
import type { P2PCategory } from "./SellerPanel";

type Ad = {
  id: string; title: string; description: string; category: string; categoryName: string | null; deliveryType: string;
  price: number; stock: number; minQty: number; maxQty: number; answers: Record<string, string>;
  sellerId: string; sellerName: string; sellerVerified: boolean; sellerAvatar: string | null; sellerOrders: number; sellerClosed: number;
};
const DELIVERY: Record<string, string> = { digital: "Instant digital", physical: "Physical item", service: "Service" };

function completion(a: Ad) {
  return a.sellerClosed > 0 ? Math.round((a.sellerOrders / a.sellerClosed) * 100) : null;
}

function Avatar({ ad }: { ad: Ad }) {
  const [broken, setBroken] = useState(false);
  if (ad.sellerAvatar && !broken) {
    // eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized avatar
    return <img className="mk-avatar" src={ad.sellerAvatar} alt="" width={28} height={28} loading="lazy" decoding="async" onError={() => setBroken(true)} />;
  }
  return <span className="mk-avatar" aria-hidden="true">{ad.sellerName.trim()[0]?.toUpperCase() ?? "?"}</span>;
}

export function Marketplace({ myId, balance, onAddMoney, onViewTrades }: { myId: string; balance: number; onAddMoney: () => void; onViewTrades: () => void }) {
  const { money } = useCurrency();
  const [cats, setCats] = useState<P2PCategory[]>([]);
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"new" | "price_asc" | "price_desc">("new");
  const [ads, setAds] = useState<Ad[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Ad | null>(null);

  useEffect(() => { api<P2PCategory[]>("/api/market/categories").then(setCats).catch(() => {}); }, []);

  async function load(offset: number) {
    const p = new URLSearchParams({ sort });
    if (category) p.set("category", category);
    if (q.trim().length >= 2) p.set("q", q.trim());
    if (offset) p.set("offset", String(offset));
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ listings: Ad[]; hasMore: boolean }>(`/api/market/listings?${p}`);
      setAds((prev) => (offset && prev ? [...prev, ...r.listings] : r.listings));
      setHasMore(r.hasMore);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const t = setTimeout(() => void load(0), q ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, q, sort]);

  return (
    <section className="card glass mk">
      <div className="mk-filters">
        <select className="mk-pill" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <select className="mk-pill" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
          <option value="new">Newest</option>
          <option value="price_asc">Lowest price</option>
          <option value="price_desc">Highest price</option>
        </select>
        <input className="mk-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ads" aria-label="Search ads" />
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}
      {ads && ads.length === 0 && !loading && <div className="empty">No ads here yet{q || category ? " for that search" : ""}. Check back soon.</div>}

      <ul className="mk-list">
        {ads?.map((a) => {
          const rate = completion(a);
          const mine = a.sellerId === myId;
          return (
            <li key={a.id} className="mk-row">
              <div className="mk-seller">
                <Avatar ad={a} />
                <span className="mk-name">{a.sellerName}</span>
                {a.sellerVerified && (
                  <span className="mk-badge" title="Verified seller" aria-label="Verified seller">
                    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l2.4 2.1 3.2-.3.8 3.1 2.8 1.6-1.2 3 1.2 3-2.8 1.6-.8 3.1-3.2-.3L12 22l-2.4-2.1-3.2.3-.8-3.1-2.8-1.6 1.2-3-1.2-3 2.8-1.6.8-3.1 3.2.3z" /><path d="M8 12.5l2.6 2.5L16 9.5" fill="none" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                )}
                <span className="mk-stats">{rate === null ? "New seller" : `${a.sellerOrders.toLocaleString("en-NG")} orders (${rate}%)`}</span>
              </div>
              <div className="mk-tags">
                <span className="ap-tag">{a.categoryName ?? a.category}</span>
                <span className={`ap-tag${a.deliveryType === "digital" ? " ok" : ""}`}>{DELIVERY[a.deliveryType] ?? a.deliveryType}</span>
                <span className="ap-tag">Escrow protected</span>
              </div>
              <button type="button" className="mk-title" onClick={() => setPicked(a)}>{a.title}</button>
              <div className="mk-bottom">
                <div>
                  <div className="mk-price">{money(a.price)}</div>
                  <div className="mk-meta"><span>Limits</span> {a.minQty === a.maxQty ? a.minQty : `${a.minQty}–${a.maxQty}`} per order</div>
                  <div className="mk-meta"><span>In stock</span> {a.stock.toLocaleString("en-NG")}</div>
                </div>
                {mine ? <span className="ap-tag">Your ad</span> : <button type="button" className="mk-buy" onClick={() => setPicked(a)}>Buy</button>}
              </div>
            </li>
          );
        })}
      </ul>
      {loading && <p className="muted" role="status">Loading ads…</p>}
      {hasMore && !loading && <button type="button" className="btn btn-ghost" onClick={() => void load(ads?.length ?? 0)}>Show more</button>}

      {picked && (
        <BuySheet ad={picked} questions={cats.find((c) => c.slug === picked.category)?.questions ?? []} mine={picked.sellerId === myId} balance={balance}
          onClose={() => setPicked(null)} onAddMoney={() => { setPicked(null); onAddMoney(); }}
          onDone={() => { setPicked(null); onViewTrades(); void load(0); }} />
      )}
    </section>
  );
}

function BuySheet({ ad, questions, mine, balance, onClose, onAddMoney, onDone }: {
  ad: Ad; questions: P2PCategory["questions"]; mine: boolean; balance: number; onClose: () => void; onAddMoney: () => void; onDone: () => void;
}) {
  const router = useRouter();
  const { money, charge } = useCurrency();
  const [qty, setQty] = useState(ad.minQty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [onClose]);

  const maxQ = Math.min(ad.maxQty, ad.stock);
  const total = ad.price * qty;
  const short = total > balance ? total - balance : 0;
  const answered = questions.filter((q) => ad.answers?.[q.id]);

  return createPortal(
    <div className="ap-sheet-wrap" onClick={onClose}>
      <div className="ap-sheet glass" role="dialog" aria-modal="true" aria-labelledby="mk-sheet-title" onClick={(e) => e.stopPropagation()}>
        <div className="ap-sheet-head">
          <div style={{ minWidth: 0 }}>
            <div className="muted" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><Avatar ad={ad} />{ad.sellerName}{ad.sellerVerified ? " · verified seller" : ""}</div>
            <h2 id="mk-sheet-title" className="ap-sheet-title">{ad.title}</h2>
          </div>
          <button type="button" className="ap-close" onClick={onClose} aria-label="Close" ref={ref}>×</button>
        </div>
        {done ? (
          <>
            <div className="form-ok" role="status">Paid into escrow. The seller has 72 hours to deliver. Your money is only released to them when you confirm (or 48 hours after delivery if you don&apos;t respond).</div>
            <button type="button" className="btn btn-primary" onClick={onDone}>Track this order</button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 14, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{ad.description}</p>
            {answered.length > 0 && (
              <dl className="ap-facts">
                {answered.map((q) => <Fragment key={q.id}><dt>{q.label}</dt><dd>{ad.answers[q.id]}</dd></Fragment>)}
              </dl>
            )}
            {!mine && (
              <>
                <div className="field">
                  <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Quantity ({ad.minQty}–{maxQ})</span>
                  <div className="mk-stepper">
                    <button type="button" className="ap-close" onClick={() => setQty((v) => Math.max(ad.minQty, v - 1))} disabled={qty <= ad.minQty} aria-label="Less">−</button>
                    <strong aria-live="polite">{qty}</strong>
                    <button type="button" className="ap-close" onClick={() => setQty((v) => Math.min(maxQ, v + 1))} disabled={qty >= maxQ} aria-label="More">+</button>
                    <span className="muted" style={{ fontSize: 13 }}>× {money(ad.price)}</span>
                  </div>
                </div>
                <div className="ap-total"><span>Total</span><strong>{money(total)}</strong></div>
                <p className="muted" style={{ fontSize: 13 }}>🔒 Your money is held safely in escrow until you confirm you received the item.</p>
                {error && <div className="form-error" role="alert">{error}</div>}
                {short > 0 ? (
                  <>
                    <div className="form-error" role="alert">Your balance is {charge(balance)}. Add {charge(short)} more to buy this.</div>
                    <button type="button" className="btn btn-primary" onClick={onAddMoney}>Add money</button>
                  </>
                ) : (
                  <button type="button" className="mk-buy mk-buy-lg" disabled={busy} onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      await api(`/api/market/listings/${ad.id}/buy`, { quantity: qty });
                      setDone(true);
                      router.refresh();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}>{busy ? "Paying…" : `Buy for ${charge(total)}`}</button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
