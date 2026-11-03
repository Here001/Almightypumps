import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { route } from "@/server/http";
import { listingsForReview } from "@/server/market";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  await requireAdmin();
  const status = new URL(req.url).searchParams.get("status") === "declined" ? "declined" : "pending";
  return listingsForReview(getDb(), status);
});
