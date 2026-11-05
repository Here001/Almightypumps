/** Admin home: what needs attention (counts for the menu badges) and today's numbers. */
import { sql } from "drizzle-orm";
import type { Db } from "./db";
import { platformWalletId } from "./wallet";

export type AdminCounts = {
  payments: number; withdrawals: number; disputes: number; esim: number; shop: number;
  sellers: number; listings: number; instantStuck: number; waitingFunds: number; sell: number; support: number;
};

const one = async <T>(db: Db, q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: T[] }).rows[0];

export async function adminCounts(db: Db): Promise<AdminCounts> {
  const r = await one<Record<keyof AdminCounts, number>>(db, sql`select
    (select count(*) from manual_deposits where status = 'pending')::int as payments,
    (select count(*) from trade_ins where status = 'pending')::int as sell,
    (select count(*) from support_threads where unread_admin)::int as support,
    (select count(*) from withdrawals where status = 'requested')::int as withdrawals,
    (select count(*) from trades where status = 'DISPUTED')::int as disputes,
    (select count(*) from esim_orders where status = 'pending')::int as esim,
    (select count(*) from shop_orders where status = 'pending')::int as shop,
    (select count(*) from users where seller_status = 'pending')::int as sellers,
    (select count(*) from listings where status = 'pending')::int as listings,
    ((select count(*) from gift_orders where status = 'pending' and not waiting_funds and created_at < now() - interval '15 minutes')
      + (select count(*) from topup_orders where status = 'pending' and not waiting_funds and created_at < now() - interval '15 minutes')
      + (select count(*) from travel_esim_orders where status = 'pending' and not waiting_funds and created_at < now() - interval '15 minutes'))::int as "instantStuck",
    ((select count(*) from smm_orders where status = 'QUEUED')
      + (select count(*) from gift_orders where status = 'pending' and waiting_funds)
      + (select count(*) from topup_orders where status = 'pending' and waiting_funds)
      + (select count(*) from travel_esim_orders where status = 'pending' and waiting_funds)
      + (select count(*) from shipments where status = 'waiting_funds'))::int as "waitingFunds"`);
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

/** Which suppliers need topping up, with how many orders and how much customer money is waiting on each. */
export async function waitingBySupplier(db: Db) {
  const res = (await db.execute(sql`
    select p.name as supplier, count(*)::int as orders, sum(o.cost)::bigint as kobo, '/admin/providers' as href
      from smm_orders o join smm_services s on s.id = o.service_id join smm_providers p on p.id = s.provider_id
      where o.status = 'QUEUED' group by p.name
    union all
    select 'Reloadly', count(*)::int, sum(price_kobo)::bigint, '/admin/instant' from (
      select price_kobo from gift_orders where status = 'pending' and waiting_funds
      union all select price_kobo from topup_orders where status = 'pending' and waiting_funds) r having count(*) > 0
    union all
    select 'eSIM Access', count(*)::int, sum(price_kobo)::bigint, '/admin/instant' from travel_esim_orders where status = 'pending' and waiting_funds having count(*) > 0
    union all
    select 'Terminal Africa (packages)', count(*)::int, sum(price_kobo)::bigint, '/admin/shipping' from shipments where status = 'waiting_funds' having count(*) > 0`)) as unknown as { rows: { supplier: string; orders: number; kobo: string; href: string }[] };
  return res.rows.map((r) => ({ ...r, kobo: Number(r.kobo) }));
}
