import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { adminStartWith, inbox } from "@/server/support";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  await requireAdmin();
  const u = new URL(req.url);
  const f = u.searchParams.get("filter");
  return inbox(getDb(), { filter: f === "closed" || f === "all" ? f : "open", q: u.searchParams.get("q") ?? "" });
});

/** Start a conversation with a customer (from their Users page). */
export const POST = route(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await body(req, z.object({ userId: z.string().uuid(), body: z.string().max(4000) }));
  return adminStartWith(getDb(), admin.id, input.userId, input.body);
});
