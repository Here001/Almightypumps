"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { appleInstallUrl, splitLpa } from "@/core/esim";
import { api } from "../api";
import { useCurrency } from "./Currency";
import { BalanceGate, Copy, Sheet, countryName, flag, statusTone, usePollPending, type Status } from "./instantUi";

type Dest = { code: string; packages: number; fromKobo: number };
type Pkg = { code: string; name: string; data: string; days: string; duration: number; countries: number; locations: string[]; priceKobo: number };
type Order = { id: string; publicId: number; label: string; priceKobo: number; status: Status; waiting?: boolean; createdAt: string; lpa: string | null; qr: string | null; iccid: string | null; hasUsage: boolean };

const POPULAR = ["US", "GB", "AE", "CA", "SA", "TR", "FR", "DE", "CN", "GH", "ZA", "IT", "ES", "JP", "QA", "EG"];
const STATUS: Record<Status, string> = { pending: "Preparing…", delivered: "Ready to install", refunded: "Refunded", failed: "Not charged" };

export function TravelEsim({ balance, onAddMoney }: { balance: number; onAddMoney: () => void }) {
  const router = useRouter();
  const { money } = useCurrency();
  const [dests, setDests] = useState<Dest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [country, setCountry] = useState<string | null>(null);
  const [pkgs, setPkgs] = useState<{ local: Pkg[]; regional: Pkg[] } | null>(null);
  const [picked, setPicked] = useState<Pkg | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    api<Dest[]>("/api/travel-esim").then(setDests).catch((e) => setError((e as Error).message));
    api<Order[]>("/api/travel-esim/orders").then(setOrders).catch(() => {});
  }, []);
  useEffect(() => {
    if (!country) { setPkgs(null); return; }
    setPkgs(null);
    api<{ local: Pkg[]; regional: Pkg[] }>(`/api/travel-esim?country=${country}`).then(setPkgs).catch((e) => setError((e as Error).message));
  }, [country]);
  const update = useCallback((o: Order) => setOrders((all) => [o, ...all.filter((x) => x.id !== o.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt))), []);
  usePollPending(orders, (id) => `/api/travel-esim/orders/${id}`, update, () => router.refresh());

  const list = useMemo(() => {
    const all = (dests ?? []).map((d) => ({ ...d, name: countryName(d.code) }));
    const s = q.trim().toLowerCase();
    if (s) return all.filter((d) => d.name.toLowerCase().includes(s) || d.code.toLowerCase() === s).sort((a, b) => a.name.localeCompare(b.name));
    const pop = POPULAR.map((c) => all.find((d) => d.code === c)).filter((d): d is NonNullable<typeof d> => Boolean(d));
    return pop.length ? pop : all.slice(0, 16);
  }, [dests, q]);

  return (
    <>
      {orders.length > 0 && (
        <section className="card glass">
          <h2>My travel eSIMs</h2>
          <ul className="es-orders">{orders.map((o) => <TravelOrder key={o.id} o={o} money={money} />)}</ul>
        </section>
      )}
      <section className="card glass">
        {!country ? (
          <>
            <h2>Where are you going?</h2>
            <p className="muted" style={{ fontSize: 14 }}>Mobile data abroad without roaming charges. Install in minutes, works in 190+ countries.</p>
            <div className="ap-search">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input type="search" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a country: UK, Dubai, Canada…" aria-label="Search countries" autoComplete="off" />
            </div>
            {error && <div className="form-error" role="alert">{error}</div>}
            {!dests && !error && <p className="muted" role="status">Loading destinations…</p>}
            {!q && dests && <strong style={{ fontSize: 14 }}>Popular</strong>}
            {dests && list.length === 0 && <div className="empty">No country matches “{q}”.</div>}
            <ul className="ap-services">
              {list.slice(0, 60).map((d) => (
                <li key={d.code}>
                  <button type="button" className="ap-service" onClick={() => setCountry(d.code)}>
                    <span className="ap-service-main"><span className="ap-service-name">{flag(d.code)} {d.name}</span></span>
                    <span className="ap-service-price"><span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>from </span>{money(d.fromKobo)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <button type="button" className="ap-link" style={{ alignSelf: "flex-start" }} onClick={() => setCountry(null)}>← All countries</button>
            <h2>{flag(country)} {countryName(country)}</h2>
            {!pkgs && !error && <p className="muted" role="status">Loading plans…</p>}
            {error && <div className="form-error" role="alert">{error}</div>}
            {pkgs && pkgs.local.length === 0 && pkgs.regional.length === 0 && <div className="empty">No plans for {countryName(country)} right now.</div>}
            {pkgs && pkgs.local.length > 0 && <PkgList list={pkgs.local} onPick={setPicked} money={money} />}
            {pkgs && pkgs.regional.length > 0 && (
              <>
                <strong style={{ fontSize: 14 }}>Multi-country plans that include {countryName(country)}</strong>
                <PkgList list={pkgs.regional} onPick={setPicked} money={money} />
              </>
            )}
          </>
        )}
      </section>
      {picked && (
        <BuyTravel p={picked} balance={balance} onClose={() => setPicked(null)} onAddMoney={() => { setPicked(null); onAddMoney(); }}
          onBought={(o) => { setPicked(null); update(o); router.refresh(); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      )}
    </>
  );
}

function PkgList({ list, onPick, money }: { list: Pkg[]; onPick: (p: Pkg) => void; money: (k: number) => string }) {
  return (
    <ul className="ap-services">
      {list.map((p) => (
        <li key={p.code}>
          <button type="button" className="ap-service" onClick={() => onPick(p)}>
            <span className="ap-service-main">
              <span className="ap-service-name">{p.data} · {p.days}</span>
              <span className="ap-service-meta muted" style={{ fontSize: 12 }}>{p.countries > 1 ? `${p.name} · ${p.countries} countries` : p.name}</span>
            </span>
            <span className="ap-service-price">{money(p.priceKobo)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function BuyTravel({ p, balance, onClose, onAddMoney, onBought }: { p: Pkg; balance: number; onClose: () => void; onAddMoney: () => void; onBought: (o: Order) => void }) {
  const { charge } = useCurrency();
  const [price, setPrice] = useState(p.priceKobo);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function buy() {
    setBusy(true); setError(null);
    try {
      onBought(await api<Order>("/api/travel-esim", { code: p.code, priceKobo: price }));
    } catch (e) {
      const m = (e as Error).message;
      setError(m);
      // The server sends the new price with a "price just changed" error; reload it from the list.
      if (m.includes("price just changed")) {
        const fresh = await api<{ local: Pkg[]; regional: Pkg[] }>(`/api/travel-esim?country=${p.locations[0] ?? "US"}`).catch(() => null);
        const np = fresh && [...fresh.local, ...fresh.regional].find((x) => x.code === p.code);
        if (np) setPrice(np.priceKobo);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet title={`${p.data} · ${p.days}`} kicker={p.name} onClose={onClose}>
      <dl className="ap-facts">
        <dt>Data</dt><dd>{p.data} of high-speed data</dd>
        <dt>Valid for</dt><dd>{p.days} from when you first connect abroad</dd>
        {p.countries > 1 && <><dt>Works in</dt><dd>{p.locations.length ? p.locations.map(countryName).join(", ") : `${p.countries} countries`}</dd></>}
        <dt>Calls & SMS</dt><dd>Data only (use WhatsApp etc. for calls)</dd>
      </dl>
      <div className="ap-total"><span>You pay</span><strong>{charge(price)}</strong></div>
      <label className="ap-toggle" style={{ fontSize: 14 }}>
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>My phone supports eSIM and is unlocked (iPhone XS or newer, Pixel 3 or newer, Samsung S20 or newer, most new phones).</span>
      </label>
      <p className="muted" style={{ fontSize: 13 }}>Your QR code appears on this page right after you pay. If it can&apos;t be prepared, you&apos;re refunded. eSIMs can&apos;t be refunded once delivered.</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      <BalanceGate price={price} balance={balance} onAddMoney={onAddMoney} charge={charge}>
        <button type="button" className="btn btn-primary" disabled={busy || !ok} onClick={() => void buy()}>{busy ? "Getting your eSIM…" : `Buy for ${charge(price)}`}</button>
      </BalanceGate>
    </Sheet>
  );
}

function TravelOrder({ o, money }: { o: Order; money: (k: number) => string }) {
  const [open, setOpen] = useState(o.status === "pending" || (o.status === "delivered" && Date.now() - Date.parse(o.createdAt) < 7 * 86_400_000));
  const [usage, setUsage] = useState<string | null>(null);
  const parts = o.lpa ? splitLpa(o.lpa) : null;
  return (
    <li className="es-order">
      <button type="button" className="es-order-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span style={{ minWidth: 0 }}><strong>{o.label}</strong><br /><span className="muted" style={{ fontSize: 13 }}>#T-{o.publicId} · {new Date(o.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" })} · {money(o.priceKobo)}</span></span>
        <span className={`ap-tag${statusTone(o.status)}`}>{STATUS[o.status]}</span>
      </button>
      {open && (
        <div className="es-order-body">
          {o.status === "pending" && <div className="vc-wait"><span className="vc-dot" aria-hidden="true" /> {o.waiting ? "In the queue: your eSIM will be ready here shortly. You're only charged once it's delivered." : "Preparing your eSIM (usually under a minute)…"}</div>}
          {(o.status === "refunded" || o.status === "failed") && <div className="form-ok" role="status">This eSIM couldn&apos;t be prepared, so you weren&apos;t charged.</div>}
          {o.status === "delivered" && o.lpa && (
            <>
              {o.qr && (
                <div className="es-qr">
                  {/* eslint-disable-next-line @next/next/no-img-element -- generated QR data URL */}
                  <img src={o.qr} alt="eSIM QR code" width={220} height={220} />
                  <p className="muted" style={{ fontSize: 13 }}>Scan this from <b>another</b> screen: Settings → Mobile/Cellular → Add eSIM → Use QR code. Install it before you travel; it starts counting days when it first connects abroad.</p>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a className="btn btn-primary ap-mini" href={appleInstallUrl(o.lpa)} target="_blank" rel="noreferrer">Install on this iPhone</a>
                <Copy text={o.lpa} label="Copy activation code" />
              </div>
              {parts && (
                <dl className="ap-facts">
                  <dt>SM-DP+ address</dt><dd><code className="ap-code">{parts.smdp}</code> <Copy text={parts.smdp} /></dd>
                  {parts.code && <><dt>Activation code</dt><dd><code className="ap-code">{parts.code}</code> <Copy text={parts.code} /></dd></>}
                </dl>
              )}
              <p className="muted" style={{ fontSize: 12 }}>Abroad: turn on the eSIM line and Data Roaming for it. Install it only once.</p>
              {o.hasUsage && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-ghost ap-mini" onClick={async () => {
                    setUsage("Checking…");
                    try {
                      const u = await api<{ used: number | null; total: number | null }>(`/api/travel-esim/orders/${o.id}?usage=1`);
                      const gb = (b: number) => `${(b / 1024 ** 3).toFixed(2)}GB`;
                      setUsage(u.total ? `${gb(u.used ?? 0)} used of ${gb(u.total)}` : "Not used yet");
                    } catch (e) { setUsage((e as Error).message); }
                  }}>Check data left</button>
                  {usage && <span className="muted" style={{ fontSize: 13 }}>{usage}</span>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}
