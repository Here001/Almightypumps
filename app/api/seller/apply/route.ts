import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { users } from "@/server/db/schema";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";

/**
 * Ask to become a seller. An admin reviews ID and bank details and approves
 * via /api/admin/sellers/:id. (Hook in a KYC provider such as Smile ID or
 * Dojah here later.)
 */
export const POST = route(async () => {
  const user = await requireUser();
  await getDb()
    .update(users)
    .set({ sellerStatus: "pending" })
    .where(and(eq(users.id, user.id), eq(users.sellerStatus, "none")));
  return { sellerStatus: user.sellerStatus === "none" ? "pending" : user.sellerStatus };
});
