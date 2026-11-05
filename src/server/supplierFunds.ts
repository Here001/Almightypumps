/**
 * When a supplier (SMM panel, Reloadly, eSIM Access, TextVerified) says our account has no money: the order is kept
 * waiting instead of failing, and every admin is emailed to top up that supplier (at most once an hour per supplier).
 */
import { readSetting, writeSetting } from "./appSettings";
import type { Db } from "./db";
import { users } from "./db/schema";
import { and, eq } from "drizzle-orm";
import { sendNotice } from "./email";
import { env } from "./env";

/** Supplier error text that means "your balance is too low". */
export function isOutOfFunds(message: string | null | undefined): boolean {
  return /not enough (funds|money|balance)|insufficient\s*(wallet\s*)?(funds|balance|account balance|credit)|INSUFFICIENT_BALANCE|balance (is )?(too low|insufficient|not enough)|low balance|top ?up your (account|balance|wallet)|no (enough )?balance|余额不足/i.test(String(message ?? ""));
}

export async function alertSupplierFunds(db: Db, supplier: string, detail: { waiting?: number; amountKobo?: number; customerFacing?: string; adminPath?: string }) {
  console.warn(`[supplier] ${supplier} has no balance${detail.waiting ? `; ${detail.waiting} order(s) waiting` : ""}`);
  const sent = await readSetting<Record<string, string>>(db, "supplier_alerts", {});
  const last = sent[supplier] ? Date.parse(sent[supplier]) : 0;
  if (Date.now() - last < 60 * 60_000) return;
  await writeSetting(db, "supplier_alerts", { ...sent, [supplier]: new Date().toISOString() });
  const admins = await db.select({ email: users.email }).from(users).where(and(eq(users.role, "admin"), eq(users.isSystem, false)));
  const money = detail.amountKobo ? ` worth ₦${Math.round(detail.amountKobo / 100).toLocaleString("en-NG")}` : "";
  await sendNotice(admins.map((a) => a.email), `Top up ${supplier}: orders are waiting`, [
    `Your ${supplier} account has run out of money, so it couldn't fulfil a customer's order.`,
    detail.customerFacing ?? `${detail.waiting ?? 1} order(s)${money} are waiting. The customers' money is on hold and they see "pending". Nothing is refunded automatically.`,
    `Add funds to your ${supplier} account, then open your admin and tap "Retry all now" (waiting orders are also retried automatically every few minutes).`,
  ], { href: `${env().APP_URL.replace(/\/+$/, "")}/admin`, label: "Open admin to retry" }).catch((e) => console.error("[supplier] alert email", e));
}
