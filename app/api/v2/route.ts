/**
 * Reseller API in the standard panel format, so resellers can plug
 * Almighty Pumps into their own panels and bots.
 *
 *   POST /api/v2   key=...  action=services|add|status|balance
 */
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { hashApiKey } from "@/core/crypto";
import { getDb } from "@/server/db";
import { apiKeys, wallets } from "@/server/db/schema";
import { toAppError } from "@/server/errors";
import { listServices, myOrders, placeOrder } from "@/server/smm";

export const dynamic = "force-dynamic";

const naira = (kobo: number) => (kobo / 100).toFixed(2);
const statusLabel: Record<string, string> = {
  PENDING: "Pending", PROCESSING: "In progress", COMPLETED: "Completed", PARTIAL: "Partial", CANCELLED: "Canceled", FAILED: "Canceled",
};

async function readParams(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, String(v)]));
  }
  const form = await req.formData().catch(() => null);
  const out: Record<string, string> = {};
  form?.forEach((v, k) => { out[k] = String(v); });
  return out;
}

export async function POST(req: Request) {
  const p = await readParams(req);
  const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
  if (!p.key) return fail("Missing API key", 401);

  const db = getDb();
  const [k] = await db.select().from(apiKeys).where(and(eq(apiKeys.keyHash, hashApiKey(p.key)), isNull(apiKeys.revokedAt)));
  if (!k) return fail("Invalid API key", 401);

  try {
    switch (p.action) {
      case "services": {
        const list = await listServices(db);
        return NextResponse.json(
          list.map((s) => ({ service: s.id, name: s.name, type: s.type, category: s.category, rate: naira(s.rateKobo), min: s.min, max: s.max, refill: s.refill, cancel: s.cancel })),
        );
      }
      case "add": {
        const o = await placeOrder(db, k.userId, { servicePublicId: Number(p.service), link: p.link ?? "", quantity: Number(p.quantity), apiKeyId: k.id });
        return NextResponse.json({ order: o.publicId });
      }
      case "status": {
        const ids = (p.orders ?? p.order ?? "").split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0).slice(0, 100);
        if (!ids.length) return fail("Send order or orders");
        const rows = await myOrders(db, k.userId, ids);
        const byId = new Map(rows.map((r) => [r.id, r]));
        const one = (id: number) => {
          const r = byId.get(id);
          if (!r) return { error: "Incorrect order ID" };
          return { charge: naira(r.charged || r.cost), start_count: r.startCount ?? 0, status: statusLabel[r.status], remains: r.remains ?? 0, currency: "NGN" };
        };
        if (p.orders) return NextResponse.json(Object.fromEntries(ids.map((id) => [String(id), one(id)])));
        return NextResponse.json(one(ids[0]));
      }
      case "balance": {
        const [w] = await db.select().from(wallets).where(eq(wallets.userId, k.userId));
        return NextResponse.json({ balance: naira(w.available), currency: "NGN" });
      }
      default:
        return fail("Unknown action");
    }
  } catch (e) {
    const err = toAppError(e);
    return fail(err.message, err.status);
  }
}
