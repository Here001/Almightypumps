import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { ledgerEntries, wallets } from "@/server/db/schema";
import { currentUser } from "@/server/auth";
import { myOrders, serviceCatalog } from "@/server/smm";
import { myTrades } from "@/server/market";
import { getMinOrderKobo, getUsdRateKobo } from "@/server/pricing";
import { hubCategories, myShopOrders } from "@/server/shop";
import { effectiveSellerStatus } from "@/server/sellers";
import { DashboardApp } from "@/components/dashboard/DashboardApp";

export const metadata: Metadata = { title: { absolute: "Dashboard · Almighty Pumps" }, robots: { index: false, follow: false } };
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
  const [history, orders, trades, catalog, minOrderKobo, usdRateKobo, shopCats, shopOrders] = await Promise.all([
    db.select().from(ledgerEntries).where(eq(ledgerEntries.walletId, wallet.id)).orderBy(desc(ledgerEntries.createdAt)).limit(20),
    myOrders(db, user.id),
    myTrades(db, user.id),
    serviceCatalog(db),
    getMinOrderKobo(db),
    getUsdRateKobo(db),
    hubCategories(db),
    myShopOrders(db, user.id),
  ]);

  return (
    <DashboardApp
      greeting={`${greeting()}, ${user.name.split(" ")[0]}`}
      isAdmin={user.role === "admin"}
      userId={user.id}
      me={{ name: user.name, email: user.email, phone: user.phone, sellerStatus: await effectiveSellerStatus(db, user.id, user.sellerStatus) }}
      wallet={{ available: wallet.available, held: wallet.held }}
      minOrderKobo={minOrderKobo}
      usdRateKobo={usdRateKobo}
      shopCategories={shopCats}
      shopOrders={shopOrders.map((o) => ({ id: o.id, product: o.product, amount: o.amount, status: o.status, content: o.content, note: o.note, when: when(o.createdAt) }))}
      catalog={catalog}
      orders={orders.map((o) => ({ id: o.id, service: o.service, platform: o.platform, link: o.link, quantity: o.quantity, amount: o.charged || o.cost, status: o.status, remains: o.remains, when: when(o.createdAt) }))}
      trades={trades.map((t) => ({ id: t.publicId, uuid: t.id, title: t.title, role: t.buyerId === user.id ? "Buying" : "Selling", amount: t.amount, status: t.status, when: when(t.createdAt), shipBy: t.shipBy.toISOString(), inspectionEndsAt: t.inspectionEndsAt?.toISOString() ?? null, proof: t.buyerId === user.id ? t.deliveryProof : null }))}
      history={history.map((h) => ({ id: h.id, what: h.memo ?? kindLabel(h.kind), change: h.availableChange, after: h.availableAfter, when: when(h.createdAt) }))}
    />
  );
}

/** Friendly names for wallet history lines that have no memo. */
function kindLabel(kind: string) {
  const [verb, what] = kind.split(":");
  const thing: Record<string, string> = {
    smm_order: "Boost order", escrow: "P2P purchase", withdrawal: "Withdrawal", shop_order: "Shop order", sms_verify: "Verification code", esim_order: "eSIM order", gift_card: "Gift card", airtime: "Airtime/data", travel_esim: "Travel eSIM",
  };
  const t = thing[what ?? ""] ?? what ?? "";
  if (kind === "deposit") return "Wallet top-up";
  if (kind === "tradein:giftcard") return "Gift card sold";
  if (kind === "tradein:crypto") return "Crypto sold";
  if (kind === "escrow:payout") return "P2P sale paid to you";
  if (verb === "capture") return what === "withdrawal" ? "Withdrawal paid to your bank" : `${t}: charged`;
  if (verb === "release") return what === "withdrawal" ? "Withdrawal returned to wallet" : `${t}: refunded`;
  if (verb === "hold") return `${t}: money set aside`;
  return kind;
}
