"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { FundWallet, LogoutButton, PaymentReturn } from "../DashboardActions";
import { Boost, type CatalogPlatform } from "./Boost";
import { CurrencyProvider, CurrencySwitch, useCurrency } from "./Currency";
import { HUB_SERVICES } from "./services";
import { VerifyCode } from "./VerifyCode";
import { Esim } from "./Esim";
import { TravelEsim } from "./TravelEsim";
import { GiftCards } from "./GiftCards";
import { Airtime } from "./Airtime";
import { SellDesk } from "./SellDesk";
import { Invite } from "./Invite";
import { Documents } from "./Documents";
import { SendPackage } from "./SendPackage";
import { Withdraw } from "./Withdraw";
import { ManualPay } from "./ManualPay";
import { BankTransfer } from "./BankTransfer";
import { ShopCategory } from "./Shop";
import { Settings } from "./Settings";
import { SellerPanel } from "./SellerPanel";
import { Marketplace } from "./Marketplace";
import { TradeActions } from "./TradeActions";
import { TradeRoom } from "./TradeRoom";
import { useRouter } from "next/navigation";
import { SHOP_ICON_PATHS } from "../icons";

type Order = { id: number; service: string; platform: string; link: string; quantity: number; amount: number; status: string; remains: number | null; when: string };
type Trade = { id: number; uuid: string; title: string; role: string; amount: number; status: string; when: string; shipBy: string; inspectionEndsAt: string | null; proof: string | null };
type Entry = { id: string; what: string; change: number; after: number; when: string };

const TABS = [
  { id: "services", label: "Services", icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  { id: "orders", label: "Orders", icon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
  { id: "wallet", label: "Wallet", icon: "M3 7h18v12H3zM3 7l2-3h12l2 3M16 13h2" },
  { id: "trades", label: "P2P", icon: "M7 7h11l-3-3M17 17H6l3 3" },
  { id: "settings", label: "Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" },
] as const;
/** Screens: the tabs, plus service screens opened from the Services hub. */
type Tab = (typeof TABS)[number]["id"] | "boost" | "verify" | "esim" | "giftcards" | "airtime" | "sell" | "invite" | "docs" | "ship" | `shop-${string}`;

const SERVICE_SCREENS = new Set<string>(["boost", "verify", "esim", "giftcards", "airtime", "sell", "invite", "docs", "ship"]);

const ORDER_STATUS: Record<string, { label: string; tone: string }> = {
  QUEUED: { label: "In queue", tone: "info" }, PENDING: { label: "Starting", tone: "" }, PROCESSING: { label: "Delivering", tone: "info" }, COMPLETED: { label: "Delivered", tone: "ok" },
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
  greeting: string; isAdmin: boolean; userId: string; wallet: { available: number; held: number }; minOrderKobo: number; usdRateKobo: number;
  catalog: CatalogPlatform[]; orders: Order[]; trades: Trade[]; history: Entry[];
  me: { name: string; email: string; phone: string | null; sellerStatus: string };
  shopCategories: { slug: string; name: string; description: string; icon: string; products: number }[];
  shopOrders: { id: number; product: string; amount: number; status: string; content: string | null; note: string | null; when: string }[];
};

export function DashboardApp(props: Props) {
  return <CurrencyProvider usdRateKobo={props.usdRateKobo}><Dashboard {...props} /></CurrencyProvider>;
}

function Dashboard(props: Props) {
  const { money, currency, charge } = useCurrency();
  const [tab, setTab] = useState<Tab>("services");
  const [p2pView, setP2pView] = useState<"market" | "mine">("market");
  const [esimKind, setEsimKind] = useState<"travel" | "us">("us");
  const [room, setRoom] = useState<string | null>(null);
  const router = useRouter();

  // Tabs live in the URL hash so the back button and Insights tracking work.
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace("#", "");
      const legacy: Record<string, Tab> = { growth: "boost" };
      const next = (legacy[h] ?? h) as Tab;
      if (next === "boost" || next === "verify" || next === "esim" || next === "giftcards" || next === "airtime" || next === "sell" || next === "invite" || next === "docs" || next === "ship" || next.startsWith("shop-") || TABS.some((t) => t.id === next)) setTab(next);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  // Hide/show balance (eye icon), remembered on this device.
  const [hideBal, setHideBal] = useState(false);
  useEffect(() => { try { setHideBal(localStorage.getItem("ap_hide_balance") === "1"); } catch { /* private mode */ } }, []);
  const toggleHide = () => setHideBal((h) => { try { localStorage.setItem("ap_hide_balance", h ? "0" : "1"); } catch { /* ignore */ } return !h; });
  const show = (kobo: number) => (hideBal ? "*****" : money(kobo));

  const go = (t: Tab) => {
    if (window.location.hash !== `#${t}`) window.location.hash = t;
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  // Services home: Boost Account, then the admin's shop categories, then "coming soon" tiles
  // (a shop category with the same name replaces its "coming soon" tile).
  const shopNames = new Set(props.shopCategories.map((c) => c.name.trim().toLowerCase()));
  const hubTiles = [
    ...HUB_SERVICES.filter((s) => s.status === "live").map((s) => ({ ...s, sub: s.id === "boost" ? `${props.catalog.length} platforms` : "Open" })),
    ...props.shopCategories.map((c) => ({
      id: `shop-${c.slug}`, title: c.name, description: c.description, icon: SHOP_ICON_PATHS[c.icon] ?? SHOP_ICON_PATHS.bag,
      status: "live" as const, sub: `${c.products} product${c.products === 1 ? "" : "s"}`,
    })),
    ...HUB_SERVICES.filter((s) => s.status === "soon" && !shopNames.has(s.title.trim().toLowerCase())).map((s) => ({ ...s, sub: "Coming soon" })),
  ];
  const shopSlug = tab.startsWith("shop-") ? tab.slice(5) : null;
  const shopName = props.shopCategories.find((c) => c.slug === shopSlug)?.name ?? "Shop";

  const delivering = props.orders.filter((o) => o.status === "QUEUED" || o.status === "PENDING" || o.status === "PROCESSING").length;

  return (
    <div className="app-shell">
      <div className="app-bg" aria-hidden="true" />
      <div className="ap">
        <aside className="ap-side glass">
          <Link href="/" className="logo" style={{ color: "var(--fg)", fontSize: 15 }}><span className="logo-mark">AP</span>ALMIGHTY PUMPS</Link>
          <nav className="ap-sidenav" aria-label="Dashboard">
            {TABS.map((t) => (
              <a key={t.id} href={`#${t.id}`} aria-current={(SERVICE_SCREENS.has(tab) || tab.startsWith("shop-") ? "services" : tab) === t.id ? "page" : undefined} onClick={(e) => { e.preventDefault(); go(t.id); }}>
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
            <div className="ap-balance glass">
              <span className="ap-balance-label">
                Balance
                <button type="button" className="ap-eye" onClick={toggleHide} aria-pressed={hideBal} aria-label={hideBal ? "Show balance" : "Hide balance"} title={hideBal ? "Show balance" : "Hide balance"}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
                    {hideBal && <path d="M3 3l18 18" />}
                  </svg>
                </button>
              </span>
              <button type="button" className="ap-balance-num" onClick={() => go("wallet")} aria-label={hideBal ? "Balance hidden. Open wallet" : `Wallet balance ${money(props.wallet.available)}. Open wallet`}>{show(props.wallet.available)}</button>
              <button type="button" className="ap-balance-add" onClick={() => go("wallet")}>+ Add money</button>
            </div>
            </div>
          </header>

          <Suspense fallback={null}><PaymentReturn /></Suspense>

          {tab === "services" && (
            <section className="card glass">
              <h2>What do you want to do?</h2>
              <div className="ap-platforms">
                {hubTiles.map((svc) => (
                  <button
                    key={svc.id} type="button" className="ap-platform ap-hub-tile" disabled={svc.status !== "live"} title={svc.description}
                    onClick={() => svc.status === "live" && go(svc.id as Tab)}
                  >
                    <span className="ap-mono ap-hub-icon" aria-hidden="true"><Icon d={svc.icon} /></span>
                    <span className="ap-platform-name">{svc.title}</span>
                    <span className="ap-platform-count">{svc.sub}</span>
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
          {shopSlug && (
            <>
              <div className="ap-crumb">
                <button type="button" className="ap-link" onClick={() => go("services")}>← All services</button>
                <span className="muted">/</span>
                <strong>{shopName}</strong>
              </div>
              <ShopCategory key={shopSlug} slug={shopSlug} balance={props.wallet.available} onAddMoney={() => go("wallet")} onViewOrders={() => go("orders")} />
            </>
          )}
          {tab === "esim" && (
            <>
              <div className="ap-crumb">
                <button type="button" className="ap-link" onClick={() => go("services")}>← All services</button>
                <span className="muted">/</span>
                <strong>eSIMs</strong>
              </div>
              <div className="ap-chips" role="group" aria-label="eSIM type">
                <button type="button" className="ap-chip" aria-pressed={esimKind === "us"} onClick={() => setEsimKind("us")}>US phone line</button>
                <button type="button" className="ap-chip" aria-pressed={esimKind === "travel"} onClick={() => setEsimKind("travel")}>Travel data · instant</button>
              </div>
              {esimKind === "travel"
                ? <TravelEsim balance={props.wallet.available} onAddMoney={() => go("wallet")} />
                : <Esim balance={props.wallet.available} onAddMoney={() => go("wallet")} />}
            </>
          )}
          {tab === "giftcards" && (
            <>
              <div className="ap-crumb">
                <button type="button" className="ap-link" onClick={() => go("services")}>← All services</button>
                <span className="muted">/</span>
                <strong>Gift Cards</strong>
              </div>
              <GiftCards balance={props.wallet.available} onAddMoney={() => go("wallet")} />
            </>
          )}
          {tab === "sell" && (
            <>
              <div className="ap-crumb">
                <button type="button" className="ap-link" onClick={() => go("services")}>← All services</button>
                <span className="muted">/</span>
                <strong>Sell Gift Cards & Crypto</strong>
              </div>
              <SellDesk />
            </>
          )}
          {tab === "ship" && (
            <>
              <div className="ap-crumb">
                <button type="button" className="ap-link" onClick={() => go("services")}>← All services</button>
                <span className="muted">/</span>
                <strong>Send/Receive a Package</strong>
              </div>
              <SendPackage balance={props.wallet.available} onAddMoney={() => go("wallet")} />
            </>
          )}
          {tab === "docs" && (
            <>
              <div className="ap-crumb">
                <button type="button" className="ap-link" onClick={() => go("services")}>← All services</button>
                <span className="muted">/</span>
                <strong>Business Documents</strong>
              </div>
              <Documents />
            </>
          )}
          {tab === "invite" && (
            <>
              <div className="ap-crumb">
                <button type="button" className="ap-link" onClick={() => go("services")}>← All services</button>
                <span className="muted">/</span>
                <strong>Invite friends</strong>
              </div>
              <Invite />
            </>
          )}
          {tab === "airtime" && (
            <>
              <div className="ap-crumb">
                <button type="button" className="ap-link" onClick={() => go("services")}>← All services</button>
                <span className="muted">/</span>
                <strong>Airtime & Data</strong>
              </div>
              <Airtime balance={props.wallet.available} onAddMoney={() => go("wallet")} />
            </>
          )}
          {tab === "verify" && (
            <>
              <div className="ap-crumb">
                <button type="button" className="ap-link" onClick={() => go("services")}>← All services</button>
                <span className="muted">/</span>
                <strong>Get Verification Code</strong>
              </div>
              <VerifyCode balance={props.wallet.available} onAddMoney={() => go("wallet")} />
            </>
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

          {tab === "orders" && props.shopOrders.length > 0 && (
            <section className="card glass">
              <h2>Shop orders</h2>
              <ul className="ap-list">
                {props.shopOrders.map((o) => (
                  <li key={o.id} className="ap-row" style={{ flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="ap-row-title">{o.product}</div>
                        <div className="muted ap-row-sub">#S-{o.id} · {o.when}</div>
                      </div>
                      <div className="ap-row-end">
                        <strong>{money(o.amount)}</strong>
                        <span className={`status ${o.status === "delivered" ? "ok" : o.status === "refunded" ? "bad" : "info"}`}>
                          {o.status === "delivered" ? "Delivered" : o.status === "refunded" ? "Refunded" : "Being prepared"}
                        </span>
                      </div>
                    </div>
                    {o.content && <RevealCode content={o.content} />}
                    {o.note && <div className="muted ap-row-sub">Note from us: {o.note}</div>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tab === "settings" && <Settings me={{ ...props.me, isAdmin: props.isAdmin }} onOpenSellerPanel={() => { setP2pView("mine"); go("trades"); }} />}

          {tab === "wallet" && (
            <>
              <section className="card glass">
                <h2>Wallet</h2>
                <div className="big">{show(props.wallet.available)}</div>
                {currency === "USD" && !hideBal && <p className="muted" style={{ fontSize: 13 }}>{charge(props.wallet.available)} · your wallet is in Naira; dollar amounts are approximate.</p>}
                <p className="muted" style={{ fontSize: 14 }}>{show(props.wallet.held)} held for orders, escrow and withdrawals</p>
                <FundWallet />
              </section>
              <BankTransfer />
              <ManualPay />
              <Withdraw available={props.wallet.available} hidden={hideBal} />
              <details className="card glass ap-collapse">
                <summary>
                  <h2>Wallet activity</h2>
                  <span className="muted ap-collapse-hint">{props.history.length ? `${props.history.length} recent` : "None yet"}</span>
                  <span className="ap-collapse-chev" aria-hidden="true">›</span>
                </summary>
                {props.history.length === 0 ? <div className="empty">Your top-ups, orders and refunds will appear here.</div> : (
                  <ul className="ap-list">
                    {props.history.map((h) => (
                      <li key={h.id} className="ap-row">
                        <div style={{ minWidth: 0 }}><div className="ap-row-title">{h.what}</div><div className="muted ap-row-sub">{h.when}</div></div>
                        <div className="ap-row-end">
                          <strong style={{ color: h.change >= 0 ? "var(--ok)" : "var(--fg)" }}>{h.change >= 0 ? "+" : "−"}{money(Math.abs(h.change))}</strong>
                          <span className="muted ap-row-sub">Balance {show(h.after)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            </>
          )}

          {tab === "trades" && props.me.sellerStatus === "verified" && (
            <div className="ap-chips ap-chips-wrap" role="group" aria-label="P2P view">
              <button type="button" className="ap-chip" aria-pressed={p2pView === "market"} onClick={() => setP2pView("market")}>Marketplace</button>
              <button type="button" className="ap-chip" aria-pressed={p2pView === "mine"} onClick={() => setP2pView("mine")}>My ads & sales</button>
            </div>
          )}
          {tab === "trades" && (p2pView === "mine" && props.me.sellerStatus === "verified"
            ? <SellerPanel />
            : <Marketplace myId={props.userId} balance={props.wallet.available} onAddMoney={() => go("wallet")} onViewTrades={() => document.getElementById("my-trades")?.scrollIntoView({ behavior: "smooth" })} />)}

          {tab === "trades" && props.trades.length > 0 && (
            <section className="card glass" id="my-trades" style={{ scrollMarginTop: 12 }}>
              <h2>My trades</h2>
              {(
                <ul className="ap-list">
                  {props.trades.map((t) => {
                    const st = TRADE_STATUS[t.status] ?? { label: t.status, tone: "" };
                    return (
                      <li key={t.id} className="ap-row" style={{ flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ minWidth: 0 }}><div className="ap-row-title">{t.title}</div><div className="muted ap-row-sub">#M-{t.id} · {t.role} · {t.when}</div></div>
                          <div className="ap-row-end"><strong>{money(t.amount)}</strong><span className={`status ${st.tone}`}>{st.label}</span></div>
                        </div>
                        <TradeActions t={t} />
                        <div><button type="button" className="btn btn-ghost ap-mini" onClick={() => setRoom(t.uuid)}>Open trade room & chat</button></div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
          {room && <TradeRoom tradeId={room} myId={props.userId} onClose={() => setRoom(null)} onChanged={() => router.refresh()} />}
        </main>
      </div>

      <nav className="ap-tabbar" aria-label="Dashboard">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.id}`} aria-current={(SERVICE_SCREENS.has(tab) || tab.startsWith("shop-") ? "services" : tab) === t.id ? "page" : undefined} onClick={(e) => { e.preventDefault(); go(t.id); }}>
            <Icon d={t.icon} /><span>{t.label}</span>
          </a>
        ))}

      </nav>
    </div>
  );
}

/** Codes stay hidden until tapped, so they aren't exposed on a shared screen. */
function RevealCode({ content }: { content: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!shown) return <button type="button" className="btn btn-ghost ap-mini" style={{ alignSelf: "flex-start" }} onClick={() => setShown(true)}>Show what you received</button>;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <div className="ap-code" style={{ flex: "1 1 200px" }}>{content}</div>
      <button type="button" className="btn btn-ghost ap-mini" onClick={async () => { try { await navigator.clipboard.writeText(content); setCopied(true); } catch { /* ignore */ } }}>{copied ? "Copied" : "Copy"}</button>
    </div>
  );
}
