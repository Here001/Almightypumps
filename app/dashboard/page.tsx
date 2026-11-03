import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { ledgerEntries, wallets } from "@/server/db/schema";
import { currentUser } from "@/server/auth";
import { listServices, myOrders } from "@/server/smm";
import { myTrades } from "@/server/market";
import { FundWallet, LogoutButton, PaymentReturn, QuickOrder } from "@/components/DashboardActions";
import { naira } from "@/components/api";

export const metadata: Metadata = { title: "Dashboard · Almighty Pumps" };
export const dynamic = "force-dynamic";

const orderTone: Record<string, string> = { COMPLETED: "ok", PROCESSING: "info", PENDING: "", PARTIAL: "warn", CANCELLED: "bad", FAILED: "bad" };
const tradeTone: Record<string, string> = { COMPLETED: "ok", SHIPPED: "info", PAID: "info", DISPUTED: "warn", CANCELLED: "bad", REFUNDED: "bad" };
const tradeLabel: Record<string, string> = { PAID: "In escrow", SHIPPED: "Inspect now", DISPUTED: "In dispute", COMPLETED: "Completed", CANCELLED: "Cancelled", REFUNDED: "Refunded" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-NG", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const db = getDb();
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, user.id));
  const [history, orders, trades, services] = await Promise.all([
    db.select().from(ledgerEntries).where(eq(ledgerEntries.walletId, wallet.id)).orderBy(desc(ledgerEntries.createdAt)).limit(8),
    myOrders(db, user.id),
    myTrades(db, user.id),
    listServices(db),
  ]);
  const activeTrades = trades.filter((t) => ["PAID", "SHIPPED", "DISPUTED"].includes(t.status));

  return (
    <div className="app-shell">
      <div className="app-bg" aria-hidden="true" />
      <div className="dash">
        <aside className="dash-side glass">
          <Link href="/" className="logo" style={{ color: "var(--fg)", fontSize: 15 }}><span className="logo-mark">AP</span>ALMIGHTY PUMPS</Link>
          <nav aria-label="Dashboard">
            <a href="/dashboard" aria-current="page">Overview</a>
            <a href="#growth">Social Growth</a>
            <a href="#trades">P2P Trades</a>
            <a href="#wallet">Wallet</a>
            {user.role === "admin" && <a href="/admin">Admin</a>}
          </nav>
          <div style={{ marginTop: "auto" }}><LogoutButton /></div>
        </aside>

        <main className="dash-main">
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 28 }}>{greeting()}, {user.name.split(" ")[0]}</h1>
              <p className="muted">{activeTrades.length} active trade{activeTrades.length === 1 ? "" : "s"} · {orders.filter((o) => o.status === "PENDING" || o.status === "PROCESSING").length} growth order(s) delivering</p>
            </div>
          </div>

          <Suspense fallback={null}><PaymentReturn /></Suspense>

          <div className="grid-cards" id="wallet">
            <section className="card glass">
              <h2>Wallet balance</h2>
              <div className="big">{naira(wallet.available)}</div>
              <p className="muted" style={{ fontSize: 14 }}>{naira(wallet.held)} held for orders, escrow and withdrawals</p>
              <FundWallet />
            </section>
            <section className="card glass" id="growth">
              <h2>Boost a post</h2>
              <QuickOrder services={services} />
            </section>
          </div>

          <section className="card glass">
            <h2>Recent growth orders</h2>
            {orders.length === 0 ? <div className="empty">No orders yet. Pick a service above to place your first one.</div> : (
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>Order</th><th>Service</th><th>Qty</th><th>Cost</th><th>Status</th></tr></thead>
                <tbody>{orders.slice(0, 10).map((o) => (
                  <tr key={o.id}><td>#{o.id}</td><td>{o.service}</td><td>{o.quantity.toLocaleString("en-NG")}</td><td>{naira(o.charged || o.cost)}</td><td><span className={`status ${orderTone[o.status] ?? ""}`}>{o.status.toLowerCase()}</span></td></tr>
                ))}</tbody>
              </table></div>
            )}
          </section>

          <section className="card glass" id="trades">
            <h2>P2P trades</h2>
            {trades.length === 0 ? <div className="empty">No trades yet. Buy from a verified seller and your money waits in escrow until you confirm.</div> : (
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>Trade</th><th>Item</th><th>Role</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>{trades.slice(0, 10).map((t) => (
                  <tr key={t.id}><td>#M-{t.publicId}</td><td>{t.title}</td><td>{t.buyerId === user.id ? "Buying" : "Selling"}</td><td>{naira(t.amount)}</td><td><span className={`status ${tradeTone[t.status] ?? ""}`}>{tradeLabel[t.status]}</span></td></tr>
                ))}</tbody>
              </table></div>
            )}
          </section>

          <section className="card glass">
            <h2>Wallet activity</h2>
            {history.length === 0 ? <div className="empty">Your top-ups, holds and payouts will appear here.</div> : (
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>When</th><th>What</th><th>Change</th><th>Balance after</th></tr></thead>
                <tbody>{history.map((h) => (
                  <tr key={h.id}>
                    <td>{h.createdAt.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })}</td>
                    <td>{h.memo ?? h.kind}</td>
                    <td style={{ color: h.availableChange >= 0 ? "var(--ok)" : "var(--fg)" }}>{h.availableChange >= 0 ? "+" : "−"}{naira(Math.abs(h.availableChange))}</td>
                    <td>{naira(h.availableAfter)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
