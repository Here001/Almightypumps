import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { route } from "@/server/http";
import { badRequest } from "@/server/errors";
import { disputesForAdmin, platformOverview, withdrawalsForAdmin } from "@/server/adminMoney";

export const dynamic = "force-dynamic";

/** ?view=wallet | withdrawals&status=requested|paid|rejected | disputes&status=open|resolved */
export const GET = route(async (req: Request) => {
  await requireAdmin();
  const p = new URL(req.url).searchParams;
  const db = getDb();
  const view = p.get("view") ?? "wallet";
  if (view === "wallet") return platformOverview(db);
  if (view === "withdrawals") {
    const s = p.get("status") ?? "requested";
    if (s !== "requested" && s !== "paid" && s !== "rejected") throw badRequest("Bad status");
    return withdrawalsForAdmin(db, s);
  }
  if (view === "disputes") return disputesForAdmin(db, p.get("status") === "resolved" ? "resolved" : "open");
  throw badRequest("Unknown view");
});
