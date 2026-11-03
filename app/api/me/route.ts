import { desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { ledgerEntries, wallets } from "@/server/db/schema";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";

export const dynamic = "force-dynamic";

/** The signed-in person, their wallet and their 30 latest wallet movements. */
export const GET = route(async () => {
  const user = await requireUser();
  const db = getDb();
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, user.id));
  const history = await db
    .select({ kind: ledgerEntries.kind, availableChange: ledgerEntries.availableChange, heldChange: ledgerEntries.heldChange, memo: ledgerEntries.memo, createdAt: ledgerEntries.createdAt })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.walletId, wallet.id))
    .orderBy(desc(ledgerEntries.createdAt))
    .limit(30);
  return { user, wallet: { available: wallet.available, held: wallet.held }, history };
});
