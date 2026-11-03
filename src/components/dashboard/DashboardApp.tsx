"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { FundWallet, LogoutButton, PaymentReturn } from "../DashboardActions";
import { Boost, type CatalogPlatform } from "./Boost";
import { CurrencyProvider, CurrencySwitch, useCurrency } from "./Currency";
import { HUB_SERVICES } from "./services";

type Order = { id: number; service: string; platform: string; link: string; quantity: number; amount: number; status: string; remains: number | null; when: string };
type Trade = { id: number; title: string; role: string; amount: number; status: string; when: string };
type Entry = { id: string; what: string; change: number; after: number; when: string };

const TABS = [
  { id: "services", label: "Services", icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  { id: "orders", label: "Orders", icon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
  { id: "wallet", label: "Wallet", icon: "M3 7h18v12H3zM3 7l2-3h12l2 3M16 13h2" },
  { id: "trades", label: "P2P", icon: "M7 7h11l-3-3M17 17H6l3 3" },
] as const;
/** Screens: the tabs, plus service screens opened from the Services hub. */
type Tab = (typeof TABS)[number]["id"] | "boost";

const ORDER_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: "Starting", tone: "" }, PROCESSING: { label: "Delivering", tone: "info" }, COMPLETED: { label: "Delivered", tone: "ok" },
  PARTIAL: { label: "Partly delivered", tone: "warn" }, CANCELLED: { label: "Refunded", tone: "bad" }, FAILED: { label: "Failed, refunded", tone: "bad" },
};
const TRADE_STATUS: Record<string, { label: string; tone: string }> = {
  PAID: { label: "In escrow", tone: "info" }, SHIPPED: { label: "Inspect now", tone: "info" }, DISPUTED: { label: "In dispute", tone: "warn" },
  COMPLETED: { label: "Completed", tone: "ok" }, CANCELLED: { label: "Cancelled", tone: "bad" }, REFUNDED: { label: "Refunded", tone: "bad" },
};

function Icon({ d }: { d: string }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

type Props = {
  greeting: string; isAdmin: boolean; wallet: { available: number; held: number }; minOrderKobo: number; usdRateKobo: number;
  catalog: CatalogPlatform[]; orders: Order[]; trades: Trade[]; history: Entry[];
};

export function DashboardApp(props: Props) {
  return <CurrencyProvider usdRateKobo={props.usdRateKobo}><Dashboard {...props} /></CurrencyProvider>;
}

function Dashboard(props: Props) {
  const { money, currency, charge } = useCurrency();
  const [tab, setTab] = useState<Tab>("services");

  // Tabs live in the URL hash so the back button and Insights tracking work.
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace("#", "");
      const legacy: Record<string, Tab> = { growth: "boost" };
      const next = (legacy[h] ?? h) as Tab;
      if (next === "boost" || TABS.some((t) => t.id === next)) setTab(next);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const go = (t: Tab) => {
    if (window.location.hash !== `#${t}`) window.location.hash = t;
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  const delivering = props.orders.filter((o) => o.status === "PENDING" || o.status === "PROCESSING").length;

  return (
    <div className="app-shell">
      <div className="app-bg" aria-hidden="true" />
      <div className="ap">
        <aside className="ap-side glass">
          <Link href="/" className="logo" style={{ color: "var(--fg)", fontSize: 15 }}><span className="logo-mark">AP</span>ALMIGHTY PUMPS</Link>
          <nav className="ap-sidenav" aria-label="Dashboard">
            {TABS.map((t) => (
              <a key={t.id} href={`#${t.id}`} aria-current={(tab === "boost" ? "services" : tab) === t.id ? "page" : undefined} onClick={(e) => { e.preventDefault(); go(t.id); }}>
                <Icon d={t.icon} />{t.label}
              </a>
            ))}
            {props.isAdmin && <a href="/admin"><Icon d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />Admin</a>}
          </nav>
          <div style={{ marginTop: "auto" }}><LogoutButton /></div>
        </aside>

        <main className="ap-main">
          <header className="ap-top">
            <div style={{ minWidth: 0 }}>
              <h1 className="ap-hello">{props.greeting}</h1>
              {delivering > 0 && <p className="muted" style={{ fontSize: 14 }}>{delivering} order{delivering === 1 ? "" : "s"} delivering now</p>}
            </div>
            <div className="ap-top-right">
            <CurrencySwitch />
            <button type="button" className="ap-balance glass" onClick={() => go("wallet")} aria-label={`Wallet balance ${money(props.wallet.available)}. Add money`}>
              <span className="ap-balance-label">Balance</span>
              <span className="ap-balance-num">{money(props.wallet.available)}</span>
              <span className="ap-balance-add">+ Add money</span>
            </button>
            </div>
          </header>

          <Suspense fallback={null}><PaymentReturn /></Suspense>

          {tab === "services" && (
            <section className="card glass">
              <h2>What would you like to do?</h2>
              <div className="ap-hub">
                {HUB_SERVICES.map((svc) => (
                  <button
                    key={svc.id} type="button" className="ap-hub-tile" disabled={svc.status !== "live"}
                    onClick={() => svc.status === "live" && go(svc.id as Tab)}
                  >
                    <span className="ap-hub-icon" aria-hidden="true"><Icon d={svc.icon} /></span>
                    <span className="ap-hub-title">{svc.title}{svc.status === "soon" && <span className="ap-tag">Coming soon</span>}</span>
                    <span className="ap-hub-desc">{svc.description}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {tab === "boost" && (
            <div className="ap-crumb">
              <button type="button" className="ap-link" onClick={() => go("services")}>← All services</button>
              <span className="muted">/</span>
              <strong>Boost Account</strong>
            </div>
          )}
          {tab === "boost" && <Boost catalog={props.catalog} balance={props.wallet.available} minOrderKobo={props.minOrderKobo} onAddMoney={() => go("wallet")} onViewOrders={() => go("orders")} />}

          {tab === "orders" && (
            <section className="card glass">
              <h2>My orders</h2>
              {props.orders.length === 0 ? (
                <div className="empty">No orders yet. <button type="button" className="ap-link" onClick={() => go("boost")}>Boost an account</button> to place your first one.</div>
              ) : (
                <ul className="ap-list">
                  {props.orders.map((o) => {
                    const st = ORDER_STATUS[o.status] ?? { label: o.status.toLowerCase(), tone: "" };
                    return (
                      <li key={o.id} className="ap-row">
                        <div style={{ minWidth: 0 }}>
                          <div className="ap-row-title">{o.service}</div>
                          <div className="muted ap-row-sub">#{o.id} · {o.quantity.toLocaleString("en-NG")} · {o.when}</div>
                          <div className="muted ap-row-sub ap-ellipsis">{o.link}</div>
                        </div>
                        <div className="ap-row-end">
                          <strong>{money(o.amount)}</strong>
                          <span className={`status ${st.tone}`}>{st.label}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {tab === "wallet" && (
            <>
              <section className="card glass">
                <h2>Wallet</h2>
                <div className="big">{money(props.wallet.available)}</div>
                {currency === "USD" && <p className="muted" style={{ fontSize: 13 }}>{charge(props.wallet.available)} · your wallet is in Naira; dollar amounts are approximate.</p>}
                <p className="muted" style={{ fontSize: 14 }}>{money(props.wallet.held)} held for orders, escrow and withdrawals</p>
                <FundWallet />
              </section>
              <section className="card glass">
                <h2>Wallet activity</h2>
                {props.history.length === 0 ? <div className="empty">Your top-ups, orders and refunds will appear here.</div> : (
                  <ul className="ap-list">
                    {props.history.map((h) => (
                      <li key={h.id} className="ap-row">
                        <div style={{ minWidth: 0 }}><div className="ap-row-title">{h.what}</div><div className="muted ap-row-sub">{h.when}</div></div>
                        <div className="ap-row-end">
                          <strong style={{ color: h.change >= 0 ? "var(--ok)" : "var(--fg)" }}>{h.change >= 0 ? "+" : "−"}{money(Math.abs(h.change))}</strong>
                          <span className="muted ap-row-sub">Balance {money(h.after)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}

          {tab === "trades" && (
            <section className="card glass">
              <h2>P2P trades</h2>
              {props.trades.length === 0 ? <div className="empty">No trades yet. When you buy from a verified seller, your money waits safely in escrow until you confirm the item.</div> : (
                <ul className="ap-list">
                  {props.trades.map((t) => {
                    const st = TRADE_STATUS[t.status] ?? { label: t.status, tone: "" };
                    return (
                      <li key={t.id} className="ap-row">
                        <div style={{ minWidth: 0 }}><div className="ap-row-title">{t.title}</div><div className="muted ap-row-sub">#M-{t.id} · {t.role} · {t.when}</div></div>
                        <div className="ap-row-end"><strong>{money(t.amount)}</strong><span className={`status ${st.tone}`}>{st.label}</span></div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </main>
      </div>

      <nav className="ap-tabbar" aria-label="Dashboard">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.id}`} aria-current={(tab === "boost" ? "services" : tab) === t.id ? "page" : undefined} onClick={(e) => { e.preventDefault(); go(t.id); }}>
            <Icon d={t.icon} /><span>{t.label}</span>
          </a>
        ))}
        {props.isAdmin && <a href="/admin"><Icon d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /><span>Admin</span></a>}
      </nav>
    </div>
  );
}
