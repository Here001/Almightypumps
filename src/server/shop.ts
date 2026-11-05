/**
 * Platform shop: admins create categories and products; customers buy with their wallet.
 * - 'code' products: the buyer instantly receives the next unused code (paid immediately).
 * - 'manual' products: the money is held; an admin delivers (charged) or refunds (released).
 */
import { alertAdmins } from "./adminAlerts";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { blockedReasons } from "@/core/listingPolicy";
import type { Kobo } from "@/core/money";
import type { Db } from "./db";
import { shopCategories, shopCodes, shopOrders, shopProducts, users } from "./db/schema";
import { badRequest, notFound } from "./errors";
import { placeHold, platformWalletId, settleHold, walletIdForUser } from "./wallet";
import { alertCustomer, alertNaira } from "./customerAlerts";

export const SHOP_ICONS = ["bag", "sim", "gift", "phone", "tv", "game", "wifi", "music", "star", "bolt", "card", "globe"] as const;
export type ShopIcon = (typeof SHOP_ICONS)[number];

export function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "category";
}

function policyCheck(...texts: string[]) {
  const reasons = blockedReasons(texts.join("\n"));
  if (reasons.length) throw badRequest(reasons.join(" "));
}

// Correlated subqueries name the outer table explicitly: drizzle renders single-table columns unqualified,
// which would silently bind to the inner table instead.
const availableCodes = sql<number>`(SELECT count(*)::int FROM shop_codes c WHERE c.product_id = "shop_products"."id" AND c.order_id IS NULL)`;

/* ---------------- admin: categories ---------------- */

export async function adminCategories(db: Db) {
  return db
    .select({
      id: shopCategories.id, slug: shopCategories.slug, name: shopCategories.name, description: shopCategories.description,
      icon: shopCategories.icon, showOnHub: shopCategories.showOnHub, active: shopCategories.active, position: shopCategories.position,
      products: sql<number>`(SELECT count(*)::int FROM shop_products p WHERE p.category_id = "shop_categories"."id")`,
      liveProducts: sql<number>`(SELECT count(*)::int FROM shop_products p WHERE p.category_id = "shop_categories"."id" AND p.active)`,
    })
    .from(shopCategories)
    .orderBy(asc(shopCategories.position), asc(shopCategories.createdAt));
}

export async function saveCategory(
  db: Db,
  input: { id?: string; name: string; description?: string; icon?: string; showOnHub?: boolean; active?: boolean },
) {
  const name = input.name.trim();
  if (name.length < 2) throw badRequest("Give the category a name.");
  policyCheck(name, input.description ?? "");
  const icon = (SHOP_ICONS as readonly string[]).includes(input.icon ?? "") ? input.icon! : "bag";
  const values = {
    name, description: (input.description ?? "").trim().slice(0, 300), icon,
    showOnHub: input.showOnHub ?? true, active: input.active ?? true,
  };
  if (input.id) {
    const [row] = await db.update(shopCategories).set(values).where(eq(shopCategories.id, input.id)).returning();
    if (!row) throw notFound("Category");
    return row;
  }
  // Unique slug for the URL (#shop-esims).
  let slug = slugify(name);
  for (let i = 2; (await db.select({ id: shopCategories.id }).from(shopCategories).where(eq(shopCategories.slug, slug))).length; i++) slug = `${slugify(name)}-${i}`;
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${shopCategories.position}), 0)::int` }).from(shopCategories);
  const [row] = await db.insert(shopCategories).values({ ...values, slug, position: max + 1 }).returning();
  return row;
}

/* ---------------- admin: products & codes ---------------- */

export async function adminProducts(db: Db, categoryId: string) {
  return db
    .select({
      id: shopProducts.id, publicId: shopProducts.publicId, name: shopProducts.name, description: shopProducts.description,
      price: shopProducts.price, delivery: shopProducts.delivery, askCustomer: shopProducts.askCustomer,
      stockLimit: shopProducts.stockLimit, active: shopProducts.active, availableCodes,
      sold: sql<number>`(SELECT count(*)::int FROM shop_orders o WHERE o.product_id = "shop_products"."id" AND o.status <> 'refunded')`,
    })
    .from(shopProducts)
    .where(eq(shopProducts.categoryId, categoryId))
    .orderBy(asc(shopProducts.position), asc(shopProducts.createdAt));
}

export async function saveProduct(
  db: Db,
  input: {
    id?: string; categoryId: string; name: string; description?: string; priceKobo: Kobo;
    delivery: "code" | "manual"; askCustomer?: string | null; stockLimit?: number | null; active?: boolean;
  },
) {
  const name = input.name.trim();
  if (name.length < 2) throw badRequest("Give the product a name.");
  if (!Number.isSafeInteger(input.priceKobo) || input.priceKobo < 100) throw badRequest("Price must be at least ₦1.");
  policyCheck(name, input.description ?? "");
  const [cat] = await db.select({ id: shopCategories.id }).from(shopCategories).where(eq(shopCategories.id, input.categoryId));
  if (!cat) throw notFound("Category");
  const values = {
    categoryId: input.categoryId, name: name.slice(0, 120), description: (input.description ?? "").trim().slice(0, 2000),
    price: input.priceKobo, delivery: input.delivery, askCustomer: input.askCustomer?.trim() || null,
    stockLimit: input.delivery === "manual" && input.stockLimit != null ? Math.max(0, Math.floor(input.stockLimit)) : null,
    active: input.active ?? true, updatedAt: new Date(),
  };
  if (input.id) {
    const [row] = await db.update(shopProducts).set(values).where(eq(shopProducts.id, input.id)).returning();
    if (!row) throw notFound("Product");
    return row;
  }
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${shopProducts.position}), 0)::int` }).from(shopProducts).where(eq(shopProducts.categoryId, input.categoryId));
  const [row] = await db.insert(shopProducts).values({ ...values, position: max + 1 }).returning();
  return row;
}

/** Add codes (one per line). Blank lines and duplicates are skipped. */
export async function addCodes(db: Db, productId: string, raw: string) {
  const [p] = await db.select({ id: shopProducts.id, delivery: shopProducts.delivery }).from(shopProducts).where(eq(shopProducts.id, productId));
  if (!p) throw notFound("Product");
  if (p.delivery !== "code") throw badRequest("This product is delivered manually, so it doesn't use codes.");
  const codes = [...new Set(raw.split(/\r?\n/).map((c) => c.trim()).filter(Boolean))].slice(0, 5000);
  if (!codes.length) throw badRequest("Paste at least one code (one per line).");
  const added = await db
    .insert(shopCodes)
    .values(codes.map((code) => ({ productId, code: code.slice(0, 500) })))
    .onConflictDoNothing()
    .returning({ id: shopCodes.id });
  return { added: added.length, duplicates: codes.length - added.length };
}

/* ---------------- customer ---------------- */

/** Categories with at least one live product, for the Services home. */
export async function hubCategories(db: Db) {
  return db
    .select({ slug: shopCategories.slug, name: shopCategories.name, description: shopCategories.description, icon: shopCategories.icon,
      products: sql<number>`(SELECT count(*)::int FROM shop_products p WHERE p.category_id = "shop_categories"."id" AND p.active)` })
    .from(shopCategories)
    .where(and(eq(shopCategories.active, true), eq(shopCategories.showOnHub, true),
      sql`EXISTS (SELECT 1 FROM shop_products p WHERE p.category_id = "shop_categories"."id" AND p.active)`))
    .orderBy(asc(shopCategories.position), asc(shopCategories.createdAt));
}

export async function categoryProducts(db: Db, slug: string) {
  const [cat] = await db.select().from(shopCategories).where(and(eq(shopCategories.slug, slug), eq(shopCategories.active, true)));
  if (!cat) throw notFound("Category");
  const products = await db
    .select({
      id: shopProducts.publicId, name: shopProducts.name, description: shopProducts.description, price: shopProducts.price,
      delivery: shopProducts.delivery, askCustomer: shopProducts.askCustomer, stockLimit: shopProducts.stockLimit, availableCodes,
    })
    .from(shopProducts)
    .where(and(eq(shopProducts.categoryId, cat.id), eq(shopProducts.active, true)))
    .orderBy(asc(shopProducts.position), asc(shopProducts.createdAt));
  return {
    category: { slug: cat.slug, name: cat.name, description: cat.description, icon: cat.icon },
    products: products.map(({ availableCodes: codes, stockLimit, ...p }) => ({
      ...p,
      soldOut: p.delivery === "code" ? codes === 0 : stockLimit !== null && stockLimit <= 0,
    })),
  };
}

export async function buyProduct(db: Db, userId: string, productPublicId: number, customerInput?: string) {
  const res = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(shopProducts).where(eq(shopProducts.publicId, productPublicId)).for("update");
    if (!p || !p.active) throw notFound("Product");
    const input = customerInput?.trim().slice(0, 500) || null;
    if (p.askCustomer && !input) throw badRequest(`Please fill in: ${p.askCustomer}`);

    let code: { id: string; code: string } | undefined;
    if (p.delivery === "code") {
      // Take the next free code; SKIP LOCKED lets two buyers check out at the same time safely.
      [code] = await tx
        .select({ id: shopCodes.id, code: shopCodes.code })
        .from(shopCodes)
        .where(and(eq(shopCodes.productId, p.id), isNull(shopCodes.orderId)))
        .orderBy(asc(shopCodes.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!code) throw badRequest("Sorry, this product is sold out right now.");
    } else if (p.stockLimit !== null) {
      if (p.stockLimit <= 0) throw badRequest("Sorry, this product is sold out right now.");
      await tx.update(shopProducts).set({ stockLimit: p.stockLimit - 1 }).where(eq(shopProducts.id, p.id));
    }

    const walletId = await walletIdForUser(tx, userId);
    const holdId = await placeHold(tx, walletId, p.price, "shop_order", { memo: p.name });
    const [order] = await tx
      .insert(shopOrders)
      .values({ userId, productId: p.id, amount: p.price, holdId, status: "pending", customerInput: input })
      .returning();

    if (code) {
      const platform = await platformWalletId(tx);
      await settleHold(tx, holdId, p.price, [{ walletId: platform, amount: p.price, kind: "revenue:shop" }], {
        refType: "shop_order", refId: order.id, idempotencyKey: `shop:${order.id}:settle`,
      });
      await tx.update(shopCodes).set({ orderId: order.id, usedAt: new Date() }).where(eq(shopCodes.id, code.id));
      await tx.update(shopOrders).set({ status: "delivered", deliveredContent: code.code, updatedAt: new Date() }).where(eq(shopOrders.id, order.id));
      return { id: order.publicId, status: "delivered" as const, content: code.code };
    }
    return { id: order.publicId, status: "pending" as const, content: null, product: p.name, amount: p.price, input };
  });
  if (res.status === "pending" && "product" in res) {
    alertAdmins(db, `Shop order to deliver: ${res.product}`, [
      `Order #${res.id}: ${res.product}.`, ...(res.input ? [`Customer's answer: ${res.input}`] : []),
      "Deliver it from the Shop page (or refund).",
    ], "/admin/shop", { customerId: userId, amountKobo: res.amount });
  }
  return { id: res.id, status: res.status, content: res.content };
}

export async function myShopOrders(db: Db, userId: string) {
  return db
    .select({
      id: shopOrders.publicId, product: shopProducts.name, amount: shopOrders.amount, status: shopOrders.status,
      content: shopOrders.deliveredContent, note: shopOrders.adminNote, createdAt: shopOrders.createdAt,
    })
    .from(shopOrders)
    .innerJoin(shopProducts, eq(shopProducts.id, shopOrders.productId))
    .where(eq(shopOrders.userId, userId))
    .orderBy(desc(shopOrders.createdAt))
    .limit(50);
}

/* ---------------- admin: orders ---------------- */

export async function adminShopOrders(db: Db, status: "pending" | "delivered" | "refunded" = "pending") {
  return db
    .select({
      id: shopOrders.id, publicId: shopOrders.publicId, product: shopProducts.name, delivery: shopProducts.delivery,
      amount: shopOrders.amount, status: shopOrders.status, customerInput: shopOrders.customerInput, askCustomer: shopProducts.askCustomer,
      content: shopOrders.deliveredContent, note: shopOrders.adminNote, createdAt: shopOrders.createdAt,
      customerName: users.name, customerEmail: users.email,
    })
    .from(shopOrders)
    .innerJoin(shopProducts, eq(shopProducts.id, shopOrders.productId))
    .innerJoin(users, eq(users.id, shopOrders.userId))
    .where(eq(shopOrders.status, status))
    .orderBy(status === "pending" ? asc(shopOrders.createdAt) : desc(shopOrders.updatedAt))
    .limit(100);
}

/** Deliver a manual order (customer is charged) or refund it (money returned). */
export async function settleShopOrder(db: Db, orderId: string, action: "deliver" | "refund", content?: string, note?: string) {
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(shopOrders).where(eq(shopOrders.id, orderId)).for("update");
    if (!o) throw notFound("Order");
    if (o.status !== "pending") throw badRequest("This order has already been completed.");
    if (action === "deliver" && !content?.trim()) throw badRequest("Write what the customer receives (e.g. the eSIM QR link or activation details).");
    const platform = await platformWalletId(tx);
    const capture = action === "deliver" ? o.amount : 0;
    await settleHold(tx, o.holdId, capture, capture ? [{ walletId: platform, amount: capture, kind: "revenue:shop" }] : [], {
      refType: "shop_order", refId: o.id, idempotencyKey: `shop:${o.id}:settle`,
    });
    if (action === "refund") {
      // Put the unit back if the product has a stock limit.
      await tx.update(shopProducts).set({ stockLimit: sql`${shopProducts.stockLimit} + 1` })
        .where(and(eq(shopProducts.id, o.productId), sql`${shopProducts.stockLimit} IS NOT NULL`));
    }
    const [u] = await tx
      .update(shopOrders)
      .set({
        status: action === "deliver" ? "delivered" : "refunded",
        deliveredContent: action === "deliver" ? content!.trim().slice(0, 2000) : null,
        adminNote: note?.trim().slice(0, 500) || null, updatedAt: new Date(),
      })
      .where(eq(shopOrders.id, o.id))
      .returning({ id: shopOrders.publicId, status: shopOrders.status });
    if (action === "deliver") alertCustomer(db, o.userId, `Shop order #${o.publicId} delivered`, [`Your shop order #${o.publicId} has been delivered. Open Orders in your account to see the details.`]);
    else alertCustomer(db, o.userId, `Shop order #${o.publicId} refunded`, [`We couldn't deliver your shop order #${o.publicId}, so ${alertNaira(o.amount)} is back in your wallet.${note?.trim() ? ` Note: ${note.trim()}` : ""}`], "wallet");
    return u;
  });
}
