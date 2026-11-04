import Link from "next/link";
import { getDb } from "@/server/db";
import { adminOrRedirect } from "@/server/adminPage";
import { adminCounts, adminToday, waitingBySupplier, type AdminCounts } from "@/server/adminHome";
import { ADMIN_GROUPS } from "@/components/adminMenu";

export const dynamic = "force-dynamic";

const nairaWhole = (kobo: number) => "₦" + Math.round(kobo / 100).toLocaleString("en-NG");

/** Things waiting for the owner, in the order they usually matter (money first). */
const TODO: { key: keyof AdminCounts; href: string; one: string; many: string; hint: string }[] = [
  { key: "payments", href: "/admin/payments", one: "payment to confirm", many: "payments to confirm", hint: "Customers say they paid by bank transfer or crypto" },
  { key: "sell", href: "/admin/sell", one: "gift card / crypto sale to check", many: "gift card / crypto sales to check", hint: "Check the card or that the crypto arrived, then pay or reject" },
  { key: "withdrawals", href: "/admin/withdrawals", one: "withdrawal to pay", many: "withdrawals to pay", hint: "Send the bank transfer, then mark it paid" },
  { key: "disputes", href: "/admin/disputes", one: "P2P dispute", many: "P2P disputes", hint: "Decide: refund the buyer or pay the seller" },
  { key: "esim", href: "/admin/esim", one: "US eSIM to deliver", many: "US eSIMs to deliver", hint: "Customers are waiting for their QR code" },
  { key: "shop", href: "/admin/shop", one: "shop order to deliver", many: "shop orders to deliver", hint: "Manual-delivery shop orders" },
  { key: "instantStuck", href: "/admin/instant", one: "gift card / airtime / eSIM order stuck", many: "gift card / airtime / eSIM orders stuck", hint: "Still processing after 15 minutes: check or refund" },
  { key: "sellers", href: "/admin/sellers", one: "seller application", many: "seller applications", hint: "Check their ID and bank details" },
  { key: "listings", href: "/admin/listings", one: "ad to review", many: "ads to review", hint: "P2P ads waiting for your approval" },
];

/** One line per menu item, so the owner knows where to go. */
const ABOUT: Record<string, string> = {
  "/admin/payments": "Bank transfer & crypto top-ups",
  "/admin/withdrawals": "Customers' cash-outs to their bank",
  "/admin/sell": "Cards and coins customers sell you, your rates",
  "/admin/money": "Your platform wallet and what you earned",
  "/admin/insights": "Visitors, sign-ups and top sellers",
  "/admin/instant": "Markups, balances, stuck orders",
  "/admin/esim": "Plans, prices and orders to deliver",
  "/admin/verify": "Markup and per-app prices",
  "/admin/shop": "Your own products and codes",
  "/admin/services": "Hide, star or check services",
  "/admin/pricing": "Markups per platform, dollar rate",
  "/admin/providers": "Connect panels, sync, balances",
  "/admin/disputes": "Refund the buyer or pay the seller",
  "/admin/sellers": "Approve or decline sellers",
  "/admin/listings": "Approve or decline ads",
  "/admin/p2p-categories": "Categories and seller questions",
  "/admin/legal": "Edit your Privacy Policy and Terms",
};

function greeting() {
  const h = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function AdminHome() {
  const me = await adminOrRedirect();
  const db = getDb();
  const [counts, today, suppliers] = await Promise.all([adminCounts(db), adminToday(db), waitingBySupplier(db)]);
  const todo = TODO.filter((t) => counts[t.key] > 0);
  const date = new Date().toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" });

  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>{greeting()}, {me.name.split(" ")[0]}</h1>
        <p className="muted">{date}</p>
      </div>

      <section className="card glass">
        <h2>Needs your attention</h2>
        {suppliers.length > 0 && (
          <ul className="adm-todo" style={{ marginBottom: 8 }}>
            {suppliers.map((w) => (
              <li key={w.supplier}>
                <Link href={w.href} className="adm-todo-urgent">
                  <span className="adm-todo-n">{w.orders}</span>
                  <span className="adm-todo-text"><strong>Top up {w.supplier}: {w.orders} order{w.orders === 1 ? " is" : "s are"} waiting</strong><span className="muted">{nairaWhole(w.kobo)} of customer orders on hold. They&apos;re sent automatically within 5 minutes of your top-up.</span></span>
                  <span aria-hidden="true" className="adm-chev">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {todo.length === 0 && suppliers.length === 0 ? (
          <div className="adm-clear"><span aria-hidden="true">✓</span> All clear. Nothing is waiting for you.</div>
        ) : (
          <ul className="adm-todo">
            {todo.map((t) => (
              <li key={t.key}>
                <Link href={t.href}>
                  <span className="adm-todo-n">{counts[t.key]}</span>
                  <span className="adm-todo-text"><strong>{counts[t.key] === 1 ? t.one : t.many}</strong><span className="muted">{t.hint}</span></span>
                  <span aria-hidden="true" className="adm-chev">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="tiles">
        <Link href="/admin/money" className="tile glass adm-tile"><div className="tile-label">Sales today</div><div className="tile-num">{nairaWhole(today.salesKobo)}</div><div className="muted tile-sub">{today.orders} sale{today.orders === 1 ? "" : "s"}</div></Link>
        <Link href="/admin/insights" className="tile glass adm-tile"><div className="tile-label">Top-ups today</div><div className="tile-num">{nairaWhole(today.topupsKobo)}</div><div className="muted tile-sub">{today.topupCount} payment{today.topupCount === 1 ? "" : "s"}</div></Link>
        <Link href="/admin/insights" className="tile glass adm-tile"><div className="tile-label">New customers today</div><div className="tile-num">{today.signups}</div></Link>
        <Link href="/admin/money" className="tile glass adm-tile"><div className="tile-label">Your platform wallet</div><div className="tile-num">{nairaWhole(today.platformKobo)}</div><div className="muted tile-sub">Customers hold {nairaWhole(today.customersKobo)}</div></Link>
      </div>

      {ADMIN_GROUPS.filter((g) => g.title).map((g) => (
        <section key={g.title} className="card glass">
          <h2>{g.title}</h2>
          <div className="adm-links">
            {g.items.map((i) => {
              const n = i.count ? counts[i.count] : 0;
              return (
                <Link key={i.href} href={i.href} className="adm-link">
                  <span className="adm-link-top"><strong>{i.label}</strong>{n > 0 && <span className="adm-badge">{n}</span>}</span>
                  <span className="muted">{ABOUT[i.href] ?? ""}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
