"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import { useCurrency } from "./Currency";

type Product = { id: number; name: string; description: string; price: number; delivery: "code" | "manual"; askCustomer: string | null; soldOut: boolean };
type Data = { category: { slug: string; name: string; description: string; icon: string }; products: Product[] };

export function ShopCategory({ slug, balance, onAddMoney, onViewOrders }: { slug: string; balance: number; onAddMoney: () => void; onViewOrders: () => void }) {
  const { money } = useCurrency();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Product | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    api<Data>(`/api/shop/${encodeURIComponent(slug)}`).then(setData).catch((e) => setError((e as Error).message));
  }, [slug]);

  if (error) return <div className="form-error" role="alert">{error}</div>;
  if (!data) return <p className="muted" role="status">Loading…</p>;

  return (
    <section className="card glass">
      <h2>{data.category.name}</h2>
      {data.category.description && <p className="muted" style={{ fontSize: 14 }}>{data.category.description}</p>}
      {data.products.length === 0 ? <div className="empty">Nothing here yet. Check back soon.</div> : (
        <ul className="ap-services">
          {data.products.map((p) => (
            <li key={p.id}>
              <button type="button" className="ap-service" disabled={p.soldOut} onClick={() => setPicked(p)} style={p.soldOut ? { opacity: 0.6, cursor: "default" } : undefined}>
                <span className="ap-service-main">
                  <span className="ap-service-name">{p.name}</span>
                  <span className="ap-service-meta">
                    <span className={`ap-tag${p.delivery === "code" ? " ok" : ""}`}>{p.delivery === "code" ? "Instant delivery" : "Delivered by our team"}</span>
                    {p.soldOut && <span className="ap-tag">Sold out</span>}
                  </span>
                  {p.description && <span className="muted" style={{ fontSize: 13, lineHeight: 1.4 }}>{p.description.length > 140 ? `${p.description.slice(0, 140)}…` : p.description}</span>}
                </span>
                <span className="ap-service-price">{money(p.price)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked && <BuySheet product={picked} balance={balance} onClose={() => setPicked(null)} onAddMoney={() => { setPicked(null); onAddMoney(); }} onViewOrders={() => { setPicked(null); onViewOrders(); }} />}
    </section>
  );
}

function BuySheet({ product, balance, onClose, onAddMoney, onViewOrders }: {
  product: Product; balance: number; onClose: () => void; onAddMoney: () => void; onViewOrders: () => void;
}) {
  const router = useRouter();
  const { charge, money } = useCurrency();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: number; status: "delivered" | "pending"; content: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  const short = product.price > balance ? product.price - balance : 0;

  async function buy(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setDone(await api<{ id: number; status: "delivered" | "pending"; content: string | null }>("/api/shop/buy", { product: product.id, input: input.trim() || undefined }));
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="ap-sheet-wrap" onClick={onClose}>
      <div className="ap-sheet glass" role="dialog" aria-modal="true" aria-labelledby="shop-sheet-title" onClick={(e) => e.stopPropagation()}>
        <div className="ap-sheet-head">
          <div style={{ minWidth: 0 }}>
            <div className="muted" style={{ fontSize: 13 }}>{product.delivery === "code" ? "Instant delivery" : "Delivered by our team"}</div>
            <h2 id="shop-sheet-title" className="ap-sheet-title">{product.name}</h2>
          </div>
          <button type="button" className="ap-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {done ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {done.status === "delivered" && done.content ? (
              <>
                <div className="form-ok" role="status">Paid. Here is your code (also saved in Orders):</div>
                <div className="ap-code">{done.content}</div>
                <button type="button" className="btn btn-primary" onClick={async () => { try { await navigator.clipboard.writeText(done.content!); setCopied(true); } catch { /* ignore */ } }}>{copied ? "Copied" : "Copy code"}</button>
              </>
            ) : (
              <div className="form-ok" role="status">Order #S-{done.id} placed. {charge(product.price)} is held and only charged once we deliver; if we can&apos;t, you get it back. You&apos;ll see the delivery in Orders.</div>
            )}
            <button type="button" className="btn btn-ghost" onClick={onViewOrders}>See my orders</button>
          </div>
        ) : (
          <form onSubmit={buy} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {product.description && <p style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{product.description}</p>}
            {product.askCustomer && (
              <div className="field">
                <label htmlFor="shop-input">{product.askCustomer}</label>
                <input id="shop-input" ref={firstRef} className="input" value={input} onChange={(e) => setInput(e.target.value)} required autoComplete="off" />
              </div>
            )}
            <div className="ap-total"><span>Total</span><strong>{money(product.price)}</strong></div>
            {error && <div className="form-error" role="alert">{error}</div>}
            {short > 0 ? (
              <>
                <div className="form-error" role="alert">Your balance is {charge(balance)}. Add {charge(short)} more to buy this.</div>
                <button type="button" className="btn btn-primary" onClick={onAddMoney}>Add money</button>
              </>
            ) : (
              <button className="btn btn-primary" disabled={busy || (Boolean(product.askCustomer) && !input.trim())}>{busy ? "Paying…" : `Pay ${charge(product.price)}`}</button>
            )}
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
