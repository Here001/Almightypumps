import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { actOnUser, userActionSchema, userDetail } from "@/server/adminUsers";

export const dynamic = "force-dynamic";

/** Admin: one customer's account. */
export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await params;
  return userDetail(getDb(), id);
});

/** Admin: act on one customer (suspend, log out, admin role, confirm email, edit, wallet adjustment). */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const input = await body(req, userActionSchema);
  return actOnUser(getDb(), admin.id, id, input);
});
