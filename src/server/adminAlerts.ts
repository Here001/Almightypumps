/**
 * Emails every admin about something waiting in the admin panel (one email per new item). Fire-and-forget: a failed
 * email never breaks the customer's action. Payments, gift cards/crypto bought, support chat and "top up a supplier"
 * have their own richer emails (manualPayments.ts, sellDesk.ts, support.ts, supplierFunds.ts).
 */
import { and, eq, sql } from "drizzle-orm";
import { readSetting, writeSetting } from "./appSettings";
import type { Db } from "./db";
import { users } from "./db/schema";
import { sendNotice } from "./email";
import { env } from "./env";

const naira = (kobo: number) => "₦" + (kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 });

export function alertAdmins(db: Db, subject: string, lines: string[], adminPath: string, opts: { customerId?: string; amountKobo?: number } = {}) {
  void (async () => {
    try {
      const admins = await db.select({ email: users.email }).from(users).where(and(eq(users.role, "admin"), eq(users.isSystem, false)));
      if (!admins.length) return;
      const extra: string[] = [];
      if (opts.customerId) {
        const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, opts.customerId));
        if (u) extra.push(`Customer: ${u.name} (${u.email})`);
      }
      if (opts.amountKobo) extra.push(`Amount: ${naira(opts.amountKobo)}`);
      await sendNotice(admins.map((a) => a.email), subject, [...lines, ...extra],
        { href: `${env().APP_URL.replace(/\/+$/, "")}${adminPath}`, label: "Open in admin" });
    } catch (e) { console.error("[admin-alert]", subject, e); }
  })();
}

/** Cron: instant orders (gift cards, airtime, travel eSIMs) still pending after 15 minutes. One email per newly stuck batch. */
export async function alertStuckInstantOrders(db: Db) {
  const last = await readSetting<{ upTo?: string }>(db, "stuck_alerted", {});
  const since = last.upTo ?? new Date(0).toISOString();
  const res = (await db.execute(sql`select count(*)::int as n, max(created_at) as newest from (
      select created_at from gift_orders where status = 'pending' and not waiting_funds and created_at < now() - interval '15 minutes' and created_at > ${since}::timestamptz
      union all select created_at from topup_orders where status = 'pending' and not waiting_funds and created_at < now() - interval '15 minutes' and created_at > ${since}::timestamptz
      union all select created_at from travel_esim_orders where status = 'pending' and not waiting_funds and created_at < now() - interval '15 minutes' and created_at > ${since}::timestamptz
    ) s`)) as unknown as { rows: { n: number; newest: string | Date | null }[] };
  const { n, newest } = res.rows[0] ?? { n: 0, newest: null };
  if (!n || !newest) return;
  await writeSetting(db, "stuck_alerted", { upTo: new Date(newest).toISOString() });
  alertAdmins(db, `${n} instant order${n === 1 ? "" : "s"} stuck for over 15 minutes`, [
    `${n} gift card / airtime / travel eSIM order${n === 1 ? " hasn't" : "s haven't"} finished after 15 minutes.`,
    "Open Gift cards · Airtime · Travel eSIMs → recent orders and tap “Check / refund”.",
  ], "/admin/instant");
}
