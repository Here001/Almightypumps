import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { decide, decideSchema, identityQueue, nameChangeQueue } from "@/server/identity";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  await requireAdmin();
  const u = new URL(req.url);
  const status = u.searchParams.get("status");
  if (u.searchParams.get("tab") === "names") return nameChangeQueue(getDb(), status === "approved" || status === "rejected" ? status : "open");
  return identityQueue(getDb(), status === "verified" || status === "rejected" ? status : "open");
});

/** Approve, reject or ask for more information (identity check or name change). */
export const POST = route(async (req: Request) => {
  const admin = await requireAdmin();
  return decide(getDb(), admin.id, await body(req, decideSchema));
});
