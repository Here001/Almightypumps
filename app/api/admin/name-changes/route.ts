import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { decideNameChange, decideSchema, nameChangeQueue } from "@/server/nameChanges";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  await requireAdmin();
  const s = new URL(req.url).searchParams.get("status");
  return nameChangeQueue(getDb(), s === "approved" || s === "rejected" ? s : "open");
});

/** Approve, reject, or ask the customer for more information. */
export const POST = route(async (req: Request) => {
  const admin = await requireAdmin();
  return decideNameChange(getDb(), admin.id, await body(req, decideSchema));
});
