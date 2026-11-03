"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import { useCurrency } from "./Currency";

export type CatalogPlatform = { platform: string; count: number; kinds: { kind: string; count: number }[] };
type Service = { id: number; name: string; platform: string; kind: string; rateKobo: number; min: number; max: number; refill: boolean };

const MONOGRAM: Record<string, string> = {
  Instagram: "IG", TikTok: "TT", YouTube: "YT", Facebook: "FB", "X (Twitter)": "X", Telegram: "TG", WhatsApp: "WA",
  Spotify: "SP", Audiomack: "AM", Boomplay: "BP", Snapchat: "SC", Threads: "TH", LinkedIn: "IN", "Apple Music": "AM",
  SoundCloud: "SC", "Website & SEO": "WWW", "Business services": "BIZ", "More services": "•••",
};
const monogram = (p: string) => MONOGRAM[p] ?? p.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
const SHOWN_PLATFORMS = 8;

function priceFor(rateKobo: number, qty: number) {
  return Math.max(1, Math.ceil((rateKobo * qty) / 1000));
}

export function Boost({ catalog, balance, minOrderKobo, onAddMoney, onViewOrders }: {
  catalog: CatalogPlatform[]; balance: number; minOrderKobo: number; onAddMoney: () => void; onViewOrders: () => void;
}) {
  const { money } = useCurrency();
  const [platform, setPlatform] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [refillOnly, setRefillOnly] = useState(false);
  const [allPlatforms, setAllPlatforms] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Service | null>(null);
  const listTop = useRef<HTMLDivElement>(null);

  const q = search.trim();
  const searching = q.length >= 2;
  const current = catalog.find((c) => c.platform === platform) ?? null;

  async function load(offset: number) {
    const params = new URLSearchParams();
    if (searching) params.set("q", q);
    else if (platform) params.set("platform", platform);
    else return;
    if (!searching && kind) params.set("kind", kind);
    if (refillOnly) params.set("refill", "1");
    if (offset) params.set("offset", String(offset));
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api<{ services: Service[]; hasMore: boolean }>(`/api/smm/services?${params}`);
      setServices((prev) => (offset ? [...prev, ...data.services] : data.services));
      setHasMore(data.hasMore);
    } catch (e) {
      setLoadError((e as Error).message || "Couldn't load services. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  // Reload the first page whenever the choice changes (search waits for a pause in typing).
  useEffect(() => {
    if (!searching && !platform) { setServices([]); setHasMore(false); return; }
    const t = setTimeout(() => void load(0), searching ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, kind, q, refillOnly]);

  const choosePlatform = (p: string) => {
    setPlatform(p);
    setKind(null);
    setSearch("");
    setTimeout(() => listTop.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  if (!catalog.length) return <section className="card glass"><h2>Boost</h2><div className="empty">Services are being set up. Please check back soon.</div></section>;

  const platforms = allPlatforms ? catalog : catalog.slice(0, SHOWN_PLATFORMS);
  const showList = searching || platform;

  return (
    <>
      <section className="card glass ap-boost">
        <h2>What do you want to boost?</h2>
        <div className="ap-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            type="search" className="input" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search: instagram followers, tiktok views…" aria-label="Search services" autoComplete="off"
          />
        </div>

        {!searching && (
          <>
            <div className="ap-platforms">
              {platforms.map((p) => (
                <button
                  key={p.platform} type="button" className="ap-platform" aria-pressed={platform === p.platform}
                  onClick={() => choosePlatform(p.platform)}
                >
                  <span className="ap-mono" aria-hidden="true">{monogram(p.platform)}</span>
                  <span className="ap-platform-name">{p.platform}</span>
                  <span className="ap-platform-count">{p.count.toLocaleString("en-NG")}</span>
                </button>
              ))}
            </div>
            {catalog.length > SHOWN_PLATFORMS && (
              <button type="button" className="ap-link" onClick={() => setAllPlatforms((v) => !v)}>
                {allPlatforms ? "Show fewer platforms" : `See all ${catalog.length} platforms`}
              </button>
            )}
          </>
        )}
      </section>

      {showList && (
        <section className="card glass" ref={listTop} style={{ scrollMarginTop: 12 }}>
          <div className="ap-list-head">
            <h2>{searching ? `Results for “${q}”` : current?.platform}</h2>
            <label className="ap-toggle">
              <input type="checkbox" checked={refillOnly} onChange={(e) => setRefillOnly(e.target.checked)} />
              <span>Refill guarantee only</span>
            </label>
          </div>

          {!searching && current && (
            <div className="ap-chips" role="group" aria-label="What do you want">
              <button type="button" className="ap-chip" aria-pressed={kind === null} onClick={() => setKind(null)}>All <span>{current.count.toLocaleString("en-NG")}</span></button>
              {current.kinds.map((k) => (
                <button key={k.kind} type="button" className="ap-chip" aria-pressed={kind === k.kind} onClick={() => setKind(k.kind)}>
                  {k.kind} <span>{k.count.toLocaleString("en-NG")}</span>
                </button>
              ))}
            </div>
          )}

          <p className="muted" style={{ fontSize: 13 }}>Cheapest first · price per 1,000</p>
          {loadError && <div className="form-error" role="alert">{loadError} <button type="button" className="ap-link" onClick={() => void load(0)}>Try again</button></div>}
          {!loading && !loadError && services.length === 0 && (
            <div className="empty">{searching ? "Nothing matches that. Try fewer or different words." : "No services here yet."}</div>
          )}

          <ul className="ap-services">
            {services.map((s) => (
              <li key={s.id}>
                <button type="button" className="ap-service" onClick={() => setPicked(s)}>
                  <span className="ap-service-main">
                    <span className="ap-service-name">{s.name}</span>
                    <span className="ap-service-meta">
                      {searching && <span className="ap-tag">{s.platform}</span>}
                      <span className="ap-tag">{s.kind}</span>
                      {s.refill && <span className="ap-tag ok">Refill</span>}
                      <span className="muted">{s.min.toLocaleString("en-NG")}–{s.max.toLocaleString("en-NG")}</span>
                    </span>
                  </span>
                  <span className="ap-service-price">{money(s.rateKobo)}<small>per 1k</small></span>
                </button>
              </li>
            ))}
          </ul>
          {loading && <p className="muted" role="status">Loading services…</p>}
          {hasMore && !loading && (
            <button type="button" className="btn btn-ghost" onClick={() => void load(services.length)}>Show more</button>
          )}
        </section>
      )}

      {picked && (
        <OrderSheet
          service={picked} balance={balance} minOrderKobo={minOrderKobo} onClose={() => setPicked(null)}
          onAddMoney={() => { setPicked(null); onAddMoney(); }} onViewOrders={() => { setPicked(null); onViewOrders(); }}
        />
      )}
    </>
  );
}

function OrderSheet({ service, balance, minOrderKobo, onClose, onAddMoney, onViewOrders }: {
  service: Service; balance: number; minOrderKobo: number; onClose: () => void; onAddMoney: () => void; onViewOrders: () => void;
}) {
  const router = useRouter();
  const { money, charge, currency } = useCurrency();
  const [link, setLink] = useState("");
  // Smallest quantity that reaches the minimum order amount (if any).
  const minQtyForAmount = minOrderKobo > 0 ? Math.ceil((minOrderKobo * 1000) / service.rateKobo) : 0;
  const startQty = Math.min(service.max, Math.max(service.min, minQtyForAmount, Math.min(1000, service.max)));
  const [qty, setQty] = useState(String(startQty));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const linkRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    linkRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  const n = Number(qty.replace(/,/g, ""));
  const validQty = Number.isInteger(n) && n >= service.min && n <= service.max;
  const total = Number.isInteger(n) && n > 0 ? priceFor(service.rateKobo, n) : 0;
  const short = total > balance ? total - balance : 0;
  const floor = Math.max(service.min, minQtyForAmount);
  const picks = [floor, 1000, 5000, 10000, 50000].filter((v, i, a) => v >= floor && v <= service.max && a.indexOf(v) === i).slice(0, 4);
  const belowMin = minOrderKobo > 0 && total > 0 && total < minOrderKobo;
  const cantReachMin = minOrderKobo > 0 && minQtyForAmount > service.max;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validQty) { setError(`Choose between ${service.min.toLocaleString("en-NG")} and ${service.max.toLocaleString("en-NG")}.`); return; }
    setBusy(true);
    setError(null);
    try {
      const o = await api<{ publicId: number }>("/api/smm/orders", { service: service.id, link: link.trim(), quantity: n });
      setDone(o.publicId);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="ap-sheet-wrap" onClick={onClose}>
      <div className="ap-sheet glass" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(e) => e.stopPropagation()}>
        <div className="ap-sheet-head">
          <div style={{ minWidth: 0 }}>
            <div className="muted" style={{ fontSize: 13 }}>{service.platform} · {service.kind}</div>
            <h2 id="sheet-title" className="ap-sheet-title">{service.name}</h2>
          </div>
          <button type="button" className="ap-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {done !== null ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="form-ok" role="status">Order #{done} placed. {charge(total)} is held and only charged as it delivers. If it doesn&apos;t deliver, you get it back.</div>
            <button type="button" className="btn btn-primary" onClick={onViewOrders}>Track my order</button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Boost something else</button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="field">
              <label htmlFor="o-link">Link to your post or profile</label>
              <input id="o-link" ref={linkRef} className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… or @username" required autoComplete="off" inputMode="url" />
            </div>
            <div className="field">
              <label htmlFor="o-qty">How many? <span className="muted">({service.min.toLocaleString("en-NG")}–{service.max.toLocaleString("en-NG")})</span></label>
              <div className="ap-qty-picks">
                {picks.map((v) => (
                  <button key={v} type="button" className="ap-chip" aria-pressed={n === v} onClick={() => setQty(String(v))}>{v.toLocaleString("en-NG")}</button>
                ))}
              </div>
              <input id="o-qty" className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="ap-total">
              <span>Total</span>
              <strong>{money(total)}</strong>
            </div>
            {service.refill && <p className="muted" style={{ fontSize: 13 }}>Includes a refill guarantee if numbers drop.</p>}
            {error && <div className="form-error" role="alert">{error}</div>}
            {cantReachMin ? (
              <div className="form-error" role="alert">Even the largest order of this service is below our {charge(minOrderKobo)} minimum. Please pick another service.</div>
            ) : belowMin ? (
              <>
                <div className="form-error" role="alert">The minimum order is {charge(minOrderKobo)}. Order at least {minQtyForAmount.toLocaleString("en-NG")}.</div>
                <button type="button" className="btn btn-primary" onClick={() => setQty(String(Math.max(service.min, minQtyForAmount)))}>Use {Math.max(service.min, minQtyForAmount).toLocaleString("en-NG")}</button>
              </>
            ) : short > 0 ? (
              <>
                <div className="form-error" role="alert">Your balance is {charge(balance)}. Add {charge(short)} more to place this order.</div>
                <button type="button" className="btn btn-primary" onClick={onAddMoney}>Add money</button>
              </>
            ) : (
              <button className="btn btn-primary" disabled={busy || !validQty || !link.trim()}>{busy ? "Placing order…" : `Pay ${charge(total)} and start`}</button>
            )}
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
