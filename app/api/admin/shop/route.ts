import { z } from "zod";
import { nairaToKobo } from "@/core/money";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { badRequest } from "@/server/errors";
import { body, route } from "@/server/http";
import {
  addCodes, adminCategories, adminProducts, adminShopOrders, saveCategory, saveProduct, settleShopOrder,
} from "@/server/shop";

export const dynamic = "force-dynamic";

/** GET ?view=categories | products&categoryId=… | orders&status=pending|delivered|refunded */
export const GET = route(async (req: Request) => {
  await requireAdmin();
  const p = new URL(req.url).searchParams;
  const db = getDb();
  const view = p.get("view");
  if (view === "products") {
    const id = z.string().uuid().safeParse(p.get("categoryId"));
    if (!id.success) throw badRequest("Pick a category.");
    return adminProducts(db, id.data);
  }
  if (view === "orders") {
    const s = p.get("status");
    return adminShopOrders(db, s === "delivered" || s === "refunded" ? s : "pending");
  }
  return adminCategories(db);
});

const schema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("category"), id: z.string().uuid().optional(), name: z.string().min(2).max(60),
    description: z.string().max(300).optional(), icon: z.string().max(20).optional(),
    showOnHub: z.boolean().optional(), active: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("product"), id: z.string().uuid().optional(), categoryId: z.string().uuid(),
    name: z.string().min(2).max(120), description: z.string().max(2000).optional(),
    price: z.union([z.string(), z.number()]), delivery: z.enum(["code", "manual"]),
    askCustomer: z.string().max(120).nullable().optional(),
    stockLimit: z.union([z.null(), z.coerce.number().int().min(0)]).optional(),
    active: z.boolean().optional(),
  }),
  z.object({ type: z.literal("codes"), productId: z.string().uuid(), codes: z.string().min(1).max(500_000) }),
  z.object({
    type: z.literal("order"), id: z.string().uuid(), action: z.enum(["deliver", "refund"]),
    content: z.string().max(2000).optional(), note: z.string().max(500).optional(),
  }),
]);

export const POST = route(async (req: Request) => {
  await requireAdmin();
  const input = await body(req, schema);
  const db = getDb();
  switch (input.type) {
    case "category": return saveCategory(db, input);
    case "product": return saveProduct(db, { ...input, priceKobo: nairaToKobo(input.price) });
    case "codes": return addCodes(db, input.productId, input.codes);
    case "order": return settleShopOrder(db, input.id, input.action, input.content, input.note);
  }
});
