import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { route } from "@/server/http";
import { listUsers, type UserFilter } from "@/server/adminUsers";

export const dynamic = "force-dynamic";

const FILTERS = new Set(["all", "admins", "sellers", "suspended", "unverified"]);

/** Admin: search all customers. ?q=&filter=&page= */
export const GET = route(async (req: Request) => {
  await requireAdmin();
  const u = new URL(req.url);
  const f = u.searchParams.get("filter") ?? "all";
  return listUsers(getDb(), { q: u.searchParams.get("q") ?? "", filter: (FILTERS.has(f) ? f : "all") as UserFilter, page: Number(u.searchParams.get("page") ?? 0) || 0 });
});
