import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { ledgerEntries, wallets } from "@/server/db/schema";
import { currentUser } from "@/server/auth";
import { myOrders, serviceCatalog } from "@/server/smm";
import { myTrades } from "@/server/market";
import { getMinOrderKobo, getUsdRateKobo } from "@/server/pricing";
import { DashboardApp } from "@/components/dashboard/DashboardApp";

export const metadata: Metadata = { title: "Dashboard · Almighty Pumps" };
export const dynamic = "force-dynamic";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-NG", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const when = (d: Date) => d.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const db = getDb();
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, user.id));
  const [history, orders, trades, catalog, minOrderKobo, usdRateKobo] = await Promise.all([
    db.select().from(ledgerEntries).where(eq(ledgerEntries.walletId, wallet.id)).orderBy(desc(ledgerEntries.createdAt)).limit(20),
    myOrders(db, user.id),
    myTrades(db, user.id),
    serviceCatalog(db),
    getMinOrderKobo(db),
    getUsdRateKobo(db),
  ]);

  return (
    <DashboardApp
      greeting={`${greeting()}, ${user.name.split(" ")[0]}`}
      isAdmin={user.role === "admin"}
      wallet={{ available: wallet.available, held: wallet.held }}
      minOrderKobo={minOrderKobo}
      usdRateKobo={usdRateKobo}
      catalog={catalog}
      orders={orders.map((o) => ({ id: o.id, service: o.service, platform: o.platform, link: o.link, quantity: o.quantity, amount: o.charged || o.cost, status: o.status, remains: o.remains, when: when(o.createdAt) }))}
      trades={trades.map((t) => ({ id: t.publicId, title: t.title, role: t.buyerId === user.id ? "Buying" : "Selling", amount: t.amount, status: t.status, when: when(t.createdAt) }))}
      history={history.map((h) => ({ id: h.id, what: h.memo ?? h.kind, change: h.availableChange, after: h.availableAfter, when: when(h.createdAt) }))}
    />
  );
}
