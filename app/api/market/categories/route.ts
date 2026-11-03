import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { allCategories } from "@/server/listingCategories";

export const dynamic = "force-dynamic";

/** Open P2P categories with their seller questions (for posting ads and reading answers). */
export const GET = route(async () => {
  await requireUser();
  return allCategories(getDb(), { activeOnly: true });
});
