import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { myListings } from "@/server/market";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();
  return myListings(getDb(), user.id);
});
