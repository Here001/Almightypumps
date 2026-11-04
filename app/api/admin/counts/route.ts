import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { route } from "@/server/http";
import { adminCounts } from "@/server/adminHome";

export const dynamic = "force-dynamic";

/** Menu badges: how many things are waiting in each admin section. */
export const GET = route(async () => {
  await requireAdmin();
  return adminCounts(getDb());
});
