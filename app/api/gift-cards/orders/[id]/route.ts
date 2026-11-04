import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { notFound } from "@/server/errors";
import { myGiftOrder } from "@/server/giftCards";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Poll one order: checks Reloadly for the code while it's being delivered. */
export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Order");
  return myGiftOrder(getDb(), user.id, id);
});
