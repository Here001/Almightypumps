/** Admin home: what needs attention (counts for the menu badges) and today's numbers. */
import { sql } from "drizzle-orm";
import type { Db } from "./db";
import { platformWalletId } from "./wallet";

export type AdminCounts = {
  payments: number; withdrawals: number; disputes: number; esim: number; shop: number;
  sellers: number; listings: number; instantStuck: number;
};

const one = async <T>(db: Db, q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: T[] }).rows[0];

export async function adminCounts(db: Db): Promise<AdminCounts> {
  const r = await one<Record<keyof AdminCounts, number>>(db, sql`select
    (select count(*) from manual_deposits where status = 'pending')::int as payments,
    (select count(*) from withdrawals where status = 'requested')::int as withdrawals,
    (select count(*) from trades where status = 'DISPUTED')::int as disputes,
    (select count(*) from esim_orders where status = 'pending')::int as esim,
    (select count(*) from shop_orders where status = 'pending')::int as shop,
    (select count(*) from users where seller_status = 'pending')::int as sellers,
    (select count(*) from listings where status = 'pending')::int as listings,
    ((select count(*) from gift_orders where status = 'pending' and created_at < now() - interval '15 minutes')
      + (select count(*) from topup_orders where status = 'pending' and created_at < now() - interval '15 minutes')
      + (select count(*) from travel_esim_orders where status = 'pending' and created_at < now() - interval '15 minutes'))::int as "instantStuck"`);
  return r;
}

/** Today (Lagos time) at a glance. */
export async function adminToday(db: Db) {
  const platform = await platformWalletId(db);
  const start = sql`(date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos')`;
  const r = await one<{ sales: number; orders: number; topups: number; topup_count: number; signups: number; platform: number; customers: number }>(db, sql`select
    coalesce((select sum(available_change) from ledger_entries where wallet_id = ${platform} and (kind like 'revenue:%' or kind like 'fee:%') and created_at >= ${start}), 0)::bigint as sales,
    (select count(*) from ledger_entries where wallet_id = ${platform} and (kind like 'revenue:%' or kind like 'fee:%') and created_at >= ${start})::int as orders,
    coalesce((select sum(available_change) from ledger_entries where kind = 'deposit' and created_at >= ${start}), 0)::bigint as topups,
    (select count(*) from ledger_entries where kind = 'deposit' and created_at >= ${start})::int as topup_count,
    (select count(*) from users where is_system = false and created_at >= ${start})::int as signups,
    (select available from wallets where id = ${platform})::bigint as platform,
    coalesce((select sum(w.available + w.held) from wallets w join users u on u.id = w.user_id where u.is_system = false), 0)::bigint as customers`);
  return {
    salesKobo: Number(r.sales), orders: r.orders, topupsKobo: Number(r.topups), topupCount: r.topup_count, signups: r.signups,
    platformKobo: Number(r.platform), customersKobo: Number(r.customers),
  };
}
