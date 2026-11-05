/**
 * Order alert emails to customers ("Your gift card is ready", "Refunded", "Pending"). Fire-and-forget: an email
 * problem never breaks an order. Customers can turn these off in Settings (users.notify_orders).
 */
import { eq } from "drizzle-orm";
import type { DbOrTx } from "./db";
import { users } from "./db/schema";
import { sendNotice } from "./email";
import { env } from "./env";

const naira = (k: number) => "₦" + (k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export { naira as alertNaira };

/** Email one customer about an order. `tab` = dashboard section the button opens (orders, wallet, ship…). */
export function alertCustomer(db: DbOrTx, userId: string, subject: string, lines: string[], tab = "orders") {
  void (async () => {
    try {
      const [u] = await db.select({ email: users.email, name: users.name, on: users.notifyOrders, system: users.isSystem }).from(users).where(eq(users.id, userId));
      if (!u || u.system || !u.on) return;
      const first = u.name.trim().split(/\s+/)[0] || "there";
      await sendNotice([u.email], subject, [`Hi ${first},`, ...lines, "You can turn these emails off in Settings."],
        { href: `${env().APP_URL.replace(/\/+$/, "")}/dashboard#${tab}`, label: "Open my account" });
    } catch (e) {
      console.error("[alerts] customer email", e);
    }
  })();
}

export const PENDING_LINE = "The supplier can't complete it right this moment, so your order is pending. Your money is on hold, not taken, and we'll email you as soon as it goes through.";
