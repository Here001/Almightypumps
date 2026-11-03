import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { route } from "@/server/http";
import { sellerApplications } from "@/server/sellers";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  await requireAdmin();
  const s = new URL(req.url).searchParams.get("status");
  return sellerApplications(getDb(), s === "verified" || s === "rejected" ? s : "pending");
});
