import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { notFound } from "@/server/errors";
import { myTravelOrder, myTravelUsage } from "@/server/travelEsim";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Poll one eSIM while it's being prepared; ?usage=1 → data used so far. */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("eSIM");
  if (new URL(req.url).searchParams.get("usage")) return myTravelUsage(getDb(), user.id, id);
  return myTravelOrder(getDb(), user.id, id);
});
