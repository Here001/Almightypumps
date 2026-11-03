/**
 * Drizzle table definitions. These mirror drizzle/0000_init.sql exactly;
 * change both together (or regenerate with `npm run db:generate`).
 */
import { pgTable, uuid, text, boolean, timestamp, bigint, integer, serial, jsonb } from "drizzle-orm/pg-core";

const money = (name: string) => bigint(name, { mode: "number" });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  role: text("role").$type<"user" | "admin">().notNull().default("user"),
  sellerStatus: text("seller_status").$type<"none" | "pending" | "verified" | "rejected">().notNull().default("none"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const wallets = pgTable("wallets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => users.id),
  available: money("available").notNull().default(0),
  held: money("held").notNull().default(0),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const holds = pgTable("holds", {
  id: uuid("id").primaryKey().defaultRandom(),
  walletId: uuid("wallet_id").notNull().references(() => wallets.id),
  amount: money("amount").notNull(),
  settled: money("settled").notNull().default(0),
  status: text("status").$type<"active" | "captured" | "released" | "partial">().notNull().default("active"),
  purpose: text("purpose").$type<"smm_order" | "escrow" | "withdrawal">().notNull(),
  refId: uuid("ref_id"),
  createdAt: ts("created_at").notNull().defaultNow(),
  closedAt: ts("closed_at"),
});

export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  walletId: uuid("wallet_id").notNull().references(() => wallets.id),
  kind: text("kind").notNull(),
  availableChange: money("available_change").notNull(),
  heldChange: money("held_change").notNull(),
  availableAfter: money("available_after").notNull(),
  heldAfter: money("held_after").notNull(),
  refType: text("ref_type"),
  refId: text("ref_id"),
  memo: text("memo"),
  idempotencyKey: text("idempotency_key").unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  reference: text("reference").notNull().unique(),
  amount: money("amount").notNull(),
  status: text("status").$type<"pending" | "success" | "failed">().notNull().default("pending"),
  provider: text("provider").notNull().default("flutterwave"),
  raw: jsonb("raw"),
  createdAt: ts("created_at").notNull().defaultNow(),
  paidAt: ts("paid_at"),
});

export const withdrawals = pgTable("withdrawals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  amount: money("amount").notNull(),
  holdId: uuid("hold_id").notNull().references(() => holds.id),
  bankCode: text("bank_code").notNull(),
  accountNumber: text("account_number").notNull(),
  accountName: text("account_name").notNull(),
  status: text("status").$type<"requested" | "paid" | "rejected">().notNull().default("requested"),
  note: text("note"),
  createdAt: ts("created_at").notNull().defaultNow(),
  decidedAt: ts("decided_at"),
});

export const smmProviders = pgTable("smm_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  apiUrl: text("api_url").notNull(),
  apiKeyEnv: text("api_key_env").notNull(),
  currency: text("currency").notNull().default("NGN"),
  fxKoboPerUnit: integer("fx_kobo_per_unit").notNull().default(100),
  markupBps: integer("markup_bps").notNull().default(3000),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const smmServices = pgTable("smm_services", {
  id: uuid("id").primaryKey().defaultRandom(),
  publicId: serial("public_id").unique(),
  providerId: uuid("provider_id").notNull().references(() => smmProviders.id),
  providerServiceId: text("provider_service_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  type: text("type").notNull().default("Default"),
  providerRate: text("provider_rate").notNull(),
  rateKobo: money("rate_kobo").notNull(),
  minQty: integer("min_qty").notNull(),
  maxQty: integer("max_qty").notNull(),
  refill: boolean("refill").notNull().default(false),
  cancel: boolean("cancel").notNull().default(false),
  active: boolean("active").notNull().default(true),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  keyHash: text("key_hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  label: text("label").notNull().default("Default"),
  createdAt: ts("created_at").notNull().defaultNow(),
  revokedAt: ts("revoked_at"),
});

export type SmmOrderStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "PARTIAL" | "CANCELLED" | "FAILED";

export const smmOrders = pgTable("smm_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  publicId: serial("public_id").unique(),
  userId: uuid("user_id").notNull().references(() => users.id),
  serviceId: uuid("service_id").notNull().references(() => smmServices.id),
  link: text("link").notNull(),
  quantity: integer("quantity").notNull(),
  cost: money("cost").notNull(),
  charged: money("charged").notNull().default(0),
  holdId: uuid("hold_id").notNull().references(() => holds.id),
  providerOrderId: text("provider_order_id"),
  status: text("status").$type<SmmOrderStatus>().notNull().default("PENDING"),
  startCount: integer("start_count"),
  remains: integer("remains"),
  error: text("error"),
  apiKeyId: uuid("api_key_id").references(() => apiKeys.id),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const listings = pgTable("listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  sellerId: uuid("seller_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  deliveryType: text("delivery_type").notNull(),
  price: money("price").notNull(),
  stock: integer("stock").notNull(),
  minQty: integer("min_qty").notNull().default(1),
  maxQty: integer("max_qty").notNull().default(1),
  status: text("status").$type<"active" | "paused" | "removed">().notNull().default("active"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export type TradeStatusDb = "PAID" | "SHIPPED" | "DISPUTED" | "COMPLETED" | "CANCELLED" | "REFUNDED";

export const trades = pgTable("trades", {
  id: uuid("id").primaryKey().defaultRandom(),
  publicId: serial("public_id").unique(),
  listingId: uuid("listing_id").notNull().references(() => listings.id),
  buyerId: uuid("buyer_id").notNull().references(() => users.id),
  sellerId: uuid("seller_id").notNull().references(() => users.id),
  quantity: integer("quantity").notNull(),
  amount: money("amount").notNull(),
  fee: money("fee").notNull().default(0),
  holdId: uuid("hold_id").notNull().references(() => holds.id),
  status: text("status").$type<TradeStatusDb>().notNull().default("PAID"),
  shipBy: ts("ship_by").notNull(),
  shippedAt: ts("shipped_at"),
  inspectionEndsAt: ts("inspection_ends_at"),
  closedAt: ts("closed_at"),
  deliveryProof: text("delivery_proof"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const tradeEvents = pgTable("trade_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tradeId: uuid("trade_id").notNull().references(() => trades.id),
  actorId: uuid("actor_id").references(() => users.id),
  action: text("action").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  note: text("note"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const tradeMessages = pgTable("trade_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tradeId: uuid("trade_id").notNull().references(() => trades.id),
  senderId: uuid("sender_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const disputes = pgTable("disputes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tradeId: uuid("trade_id").notNull().unique().references(() => trades.id),
  openedBy: uuid("opened_by").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  resolution: text("resolution"),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
  resolvedAt: ts("resolved_at"),
});
