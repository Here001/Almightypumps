/**
 * Drizzle table definitions. These mirror drizzle/0000_init.sql exactly;
 * change both together (or regenerate with `npm run db:generate`).
 */
import { pgTable, uuid, text, boolean, timestamp, bigint, bigserial, integer, serial, jsonb, customType } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

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
  /** Bumped on password change / "log out everywhere"; older sessions stop working. */
  sessionVersion: integer("session_version").notNull().default(0),
  /** Null until the 6-digit email code from sign-up is entered (migration 0021). */
  emailVerifiedAt: ts("email_verified_at"),
  /** Invite code (migration 0025); created the first time it's needed. */
  referralCode: text("referral_code").unique(),
  /** Who invited this customer (users.id). */
  referredBy: uuid("referred_by"),
  /** Set when an admin suspends the account (migration 0030): no login, no API. */
  suspendedAt: ts("suspended_at"),
  suspendReason: text("suspend_reason"),
  /** Email me when my orders are delivered, refunded or pending (migration 0032). */
  notifyOrders: boolean("notify_orders").notNull().default(true),
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
  purpose: text("purpose").$type<"smm_order" | "escrow" | "withdrawal" | "shop_order" | "sms_verify" | "esim_order" | "gift_card" | "airtime" | "travel_esim" | "shipping">().notNull(),
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
  bankAccountName: text("bank_account_name"),
  nameCheck: text("name_check").$type<"match" | "unchecked">(),
  createdAt: ts("created_at").notNull().defaultNow(),
  decidedAt: ts("decided_at"),
});

export const nameChangeRequests = pgTable("name_change_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  oldName: text("old_name").notNull(),
  newName: text("new_name").notNull(),
  reason: text("reason").notNull(),
  status: text("status").$type<"pending" | "info_needed" | "approved" | "rejected" | "cancelled">().notNull().default("pending"),
  adminNote: text("admin_note"),
  customerReply: text("customer_reply"),
  createdAt: ts("created_at").notNull().defaultNow(),
  decidedAt: ts("decided_at"),
  decidedBy: uuid("decided_by").references(() => users.id),
});

export const kycFiles = pgTable("kyc_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  refType: text("ref_type").$type<"identity" | "name_change">().notNull(),
  refId: uuid("ref_id").notNull(),
  kind: text("kind").$type<"id_front" | "id_back" | "selfie" | "extra">().notNull(),
  contentType: text("content_type").notNull(),
  data: bytea("data").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const smmProviders = pgTable("smm_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  apiUrl: text("api_url").notNull(),
  apiKeyEnv: text("api_key_env").notNull(),
  /** Encrypted API key (src/server/secretBox.ts); used instead of apiKeyEnv when set. */
  apiKeyEnc: text("api_key_enc"),
  /** Last 4 characters of the key, to show the admin which key is saved. */
  apiKeyHint: text("api_key_hint"),
  currency: text("currency").notNull().default("NGN"),
  fxKoboPerUnit: integer("fx_kobo_per_unit").notNull().default(100),
  fxAuto: boolean("fx_auto").notNull().default(false),
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
  platform: text("platform").notNull().default("More services"),
  kind: text("kind").notNull().default("Other"),
  displayName: text("display_name").notNull().default(""),
  /** null = on sale; "admin" hidden by an admin; "policy" not allowed; "provider" dropped upstream. */
  hiddenReason: text("hidden_reason").$type<"admin" | "policy" | "provider" | null>(),
  providerRecommended: boolean("provider_recommended").notNull().default(false),
  featured: boolean("featured").notNull().default(false),
  providerExtra: jsonb("provider_extra"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  /** Generated in SQL (drizzle/0018): platform|kind|normalised name. Same key = same product. */
  matchKey: text("match_key").generatedAlwaysAs(sql`platform || '|' || kind`),
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

export type SmmOrderStatus = "QUEUED" | "PENDING" | "PROCESSING" | "COMPLETED" | "PARTIAL" | "CANCELLED" | "FAILED";

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
  status: text("status").$type<"active" | "paused" | "removed" | "pending" | "declined">().notNull().default("active"),
  /** Why it's waiting for review, or why an admin declined it. */
  reviewNote: text("review_note"),
  /** Seller's answers to the category questions ({questionId: answer}). */
  answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
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

/** Anonymous page/section views (see drizzle/0001_site_events.sql). */
export const siteEvents = pgTable("site_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  at: ts("at").notNull().defaultNow(),
  visitor: text("visitor").notNull(),
  userId: uuid("user_id").references(() => users.id),
  section: text("section").notNull(),
  path: text("path").notNull(),
});

/** Markup overrides (see drizzle/0004_pricing_rules.sql). kind null = whole platform. */
export const smmPricingRules = pgTable("smm_pricing_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  platform: text("platform").notNull(),
  kind: text("kind"),
  markupBps: integer("markup_bps").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/* ---------------- platform shop (drizzle/0008_shop.sql) ---------------- */

export const shopCategories = pgTable("shop_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  icon: text("icon").notNull().default("bag"),
  showOnHub: boolean("show_on_hub").notNull().default(true),
  active: boolean("active").notNull().default(true),
  position: integer("position").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const shopProducts = pgTable("shop_products", {
  id: uuid("id").primaryKey().defaultRandom(),
  publicId: serial("public_id").unique(),
  categoryId: uuid("category_id").notNull().references(() => shopCategories.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  price: money("price").notNull(),
  delivery: text("delivery").$type<"code" | "manual">().notNull(),
  askCustomer: text("ask_customer"),
  stockLimit: integer("stock_limit"),
  active: boolean("active").notNull().default(true),
  position: integer("position").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const shopCodes = pgTable("shop_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => shopProducts.id),
  code: text("code").notNull(),
  orderId: uuid("order_id"),
  createdAt: ts("created_at").notNull().defaultNow(),
  usedAt: ts("used_at"),
});

export const shopOrders = pgTable("shop_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  publicId: serial("public_id").unique(),
  userId: uuid("user_id").notNull().references(() => users.id),
  productId: uuid("product_id").notNull().references(() => shopProducts.id),
  amount: money("amount").notNull(),
  holdId: uuid("hold_id").notNull().references(() => holds.id),
  status: text("status").$type<"pending" | "delivered" | "refunded">().notNull(),
  customerInput: text("customer_input"),
  deliveredContent: text("delivered_content"),
  adminNote: text("admin_note"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Seller applications (drizzle/0010_seller_profiles.sql). ID numbers: admins only. */
export const sellerProfiles = pgTable("seller_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  businessName: text("business_name").notNull(),
  contactPhone: text("contact_phone").notNull(),
  bankName: text("bank_name").notNull(),
  bankCode: text("bank_code").notNull(),
  accountNumber: text("account_number").notNull(),
  accountName: text("account_name").notNull(),
  idType: text("id_type").$type<"nin" | "drivers_license" | "passport" | "voters_card">().notNull(),
  idNumber: text("id_number").notNull(),
  whatTheySell: text("what_they_sell").notNull().default(""),
  reviewNote: text("review_note"),
  submittedAt: ts("submitted_at").notNull().defaultNow(),
  decidedAt: ts("decided_at"),
});

/** Seller shop picture (drizzle/0012_seller_avatars.sql). Bytes are served by /api/sellers/[id]/avatar. */
export const sellerAvatars = pgTable("seller_avatars", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  contentType: text("content_type").notNull(),
  data: bytea("data").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** P2P categories with per-category seller questions (drizzle/0011_listing_categories.sql). */
export const listingCategories = pgTable("listing_categories", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  questions: jsonb("questions").$type<import("@/core/listingQuestions").Question[]>().notNull().default([]),
  requiresReview: boolean("requires_review").notNull().default(false),
  active: boolean("active").notNull().default(true),
  position: integer("position").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** "Get Verification Code" (drizzle/0013_sms_verify.sql). */
export const smsServices = pgTable("sms_services", {
  name: text("name").primaryKey(),
  label: text("label"),
  hidden: boolean("hidden").notNull().default(false),
  fixedPriceKobo: bigint("fixed_price_kobo", { mode: "number" }),
  costUsdMilli: integer("cost_usd_milli"),
  pricedAt: ts("priced_at"),
  seenAt: ts("seen_at").notNull().defaultNow(),
});

export const smsVerifications = pgTable("sms_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  serviceName: text("service_name").notNull(),
  label: text("label"),
  providerId: text("provider_id").unique(),
  number: text("number"),
  status: text("status").$type<"pending" | "completed" | "refunded" | "failed">().notNull().default("pending"),
  priceKobo: bigint("price_kobo", { mode: "number" }).notNull(),
  costUsdMilli: integer("cost_usd_milli").notNull(),
  holdId: uuid("hold_id").references(() => holds.id),
  code: text("code"),
  smsText: text("sms_text"),
  endsAt: ts("ends_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Rate-limit counters (drizzle/0016_rate_limits.sql); written with raw SQL in src/server/rateLimit.ts. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").notNull(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull().default(1),
  rule: text("rule"),
});

/** eSIMs sold by hand (drizzle/0019_esim.sql). */
export const esimPlans = pgTable("esim_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  network: text("network").notNull().default(""),
  description: text("description").notNull().default(""),
  allowKeepNumber: boolean("allow_keep_number").notNull().default(true),
  keepNumberFee: money("keep_number_fee").notNull().default(0),
  active: boolean("active").notNull().default(true),
  position: integer("position").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const esimPrices = pgTable("esim_prices", {
  id: uuid("id").primaryKey().defaultRandom(),
  planId: uuid("plan_id").notNull().references(() => esimPlans.id, { onDelete: "cascade" }),
  dataLabel: text("data_label").notNull(),
  months: integer("months").notNull(),
  price: money("price").notNull(),
  active: boolean("active").notNull().default(true),
});

export const esimOrders = pgTable("esim_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  publicId: serial("public_id").unique(),
  userId: uuid("user_id").notNull().references(() => users.id),
  planId: uuid("plan_id").notNull().references(() => esimPlans.id),
  planName: text("plan_name").notNull(),
  dataLabel: text("data_label").notNull(),
  months: integer("months").notNull(),
  amount: money("amount").notNull(),
  holdId: uuid("hold_id").notNull().references(() => holds.id),
  imei: text("imei").notNull(),
  numberMode: text("number_mode").$type<"new" | "keep">().notNull(),
  portEnc: text("port_enc"),
  portNumber: text("port_number"),
  status: text("status").$type<"pending" | "delivered" | "refunded">().notNull().default("pending"),
  phoneNumber: text("phone_number"),
  lpa: text("lpa"),
  qrImage: bytea("qr_image"),
  qrType: text("qr_type"),
  customerNote: text("customer_note"),
  adminNote: text("admin_note"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/* ---------- Reloadly gift cards + airtime/data, eSIM Access travel eSIMs (migration 0020) ---------- */

export const giftProducts = pgTable("gift_products", {
  productId: integer("product_id").primaryKey(),
  country: text("country").notNull(),
  name: text("name").notNull(),
  brand: text("brand").notNull(),
  data: jsonb("data").notNull(),
  hidden: boolean("hidden").notNull().default(false),
  featured: boolean("featured").notNull().default(false),
  seenAt: ts("seen_at").notNull().defaultNow(),
});

type OrderStatus = "pending" | "delivered" | "refunded" | "failed";

export const giftOrders = pgTable("gift_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  publicId: serial("public_id").unique(),
  userId: uuid("user_id").notNull().references(() => users.id),
  productId: integer("product_id").notNull(),
  productName: text("product_name").notNull(),
  country: text("country").notNull(),
  faceValue: text("face_value").notNull(),
  faceCurrency: text("face_currency").notNull(),
  priceKobo: money("price_kobo").notNull(),
  cost: text("cost"),
  costCurrency: text("cost_currency"),
  holdId: uuid("hold_id").notNull().references(() => holds.id),
  status: text("status").$type<OrderStatus>().notNull().default("pending"),
  providerTx: text("provider_tx"),
  codesEnc: text("codes_enc"),
  /** Supplier had no balance: accepted, money held, retried by the cron (migration 0023). */
  waitingFunds: boolean("waiting_funds").notNull().default(false),
  error: text("error"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const topupOrders = pgTable("topup_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  publicId: serial("public_id").unique(),
  userId: uuid("user_id").notNull().references(() => users.id),
  kind: text("kind").$type<"airtime" | "data">().notNull(),
  network: text("network").notNull(),
  operatorId: integer("operator_id").notNull(),
  phone: text("phone").notNull(),
  description: text("description").notNull(),
  sendAmount: text("send_amount").notNull(),
  sendCurrency: text("send_currency").notNull(),
  priceKobo: money("price_kobo").notNull(),
  holdId: uuid("hold_id").notNull().references(() => holds.id),
  status: text("status").$type<OrderStatus>().notNull().default("pending"),
  providerTx: text("provider_tx"),
  /** Supplier had no balance: accepted, money held, retried by the cron (migration 0023). */
  waitingFunds: boolean("waiting_funds").notNull().default(false),
  error: text("error"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const travelPackages = pgTable("travel_packages", {
  code: text("code").primaryKey(),
  slug: text("slug"),
  name: text("name").notNull(),
  priceE4: integer("price_e4").notNull(),
  volumeBytes: bigint("volume_bytes", { mode: "number" }).notNull(),
  duration: integer("duration").notNull(),
  durationUnit: text("duration_unit").notNull().default("DAY"),
  locations: text("locations").array().notNull().default(sql`'{}'`),
  description: text("description").notNull().default(""),
  hidden: boolean("hidden").notNull().default(false),
  seenAt: ts("seen_at").notNull().defaultNow(),
});

export const travelEsimOrders = pgTable("travel_esim_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  publicId: serial("public_id").unique(),
  userId: uuid("user_id").notNull().references(() => users.id),
  packageCode: text("package_code").notNull(),
  packageName: text("package_name").notNull(),
  priceKobo: money("price_kobo").notNull(),
  costE4: integer("cost_e4").notNull(),
  holdId: uuid("hold_id").notNull().references(() => holds.id),
  status: text("status").$type<OrderStatus>().notNull().default("pending"),
  providerOrderNo: text("provider_order_no"),
  esimTranNo: text("esim_tran_no"),
  iccid: text("iccid"),
  lpa: text("lpa"),
  /** Supplier had no balance: accepted, money held, retried by the cron (migration 0023). */
  waitingFunds: boolean("waiting_funds").notNull().default(false),
  error: text("error"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/* ---------- Email codes + trusted devices (migration 0021) ---------- */

export const emailCodes = pgTable("email_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose").$type<"signup" | "login" | "reset">().notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  remember: boolean("remember").notNull().default(false),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const trustedDevices = pgTable("trusted_devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
  lastUsedAt: ts("last_used_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull(),
});

/* ---------- Manual top-ups: bank transfer / crypto (migration 0022) ---------- */

export const manualDeposits = pgTable("manual_deposits", {
  id: uuid("id").primaryKey().defaultRandom(),
  publicId: serial("public_id").unique(),
  userId: uuid("user_id").notNull().references(() => users.id),
  methodId: text("method_id").notNull(),
  methodLabel: text("method_label").notNull(),
  kind: text("kind").$type<"bank" | "crypto">().notNull(),
  amountKobo: money("amount_kobo").notNull(),
  payAmount: text("pay_amount").notNull(),
  proof: text("proof").notNull(),
  status: text("status").$type<"pending" | "confirmed" | "rejected">().notNull().default("pending"),
  creditedKobo: money("credited_kobo"),
  adminNote: text("admin_note"),
  decidedBy: uuid("decided_by").references(() => users.id),
  decidedAt: ts("decided_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/* ---------- Sell gift cards & crypto (migration 0024) ---------- */

export const tradeIns = pgTable("trade_ins", {
  id: uuid("id").primaryKey().defaultRandom(),
  publicId: serial("public_id").unique(),
  userId: uuid("user_id").notNull().references(() => users.id),
  kind: text("kind").$type<"giftcard" | "crypto">().notNull(),
  itemId: text("item_id").notNull(),
  itemLabel: text("item_label").notNull(),
  cardForm: text("card_form").$type<"ecode" | "physical" | null>(),
  value: text("value").notNull(),
  currency: text("currency").notNull(),
  rateKobo: money("rate_kobo").notNull(),
  payoutKobo: money("payout_kobo").notNull(),
  proof: text("proof").notNull().default(""),
  note: text("note").notNull().default(""),
  status: text("status").$type<"pending" | "paid" | "rejected">().notNull().default("pending"),
  paidKobo: money("paid_kobo"),
  adminNote: text("admin_note"),
  decidedBy: uuid("decided_by").references(() => users.id),
  decidedAt: ts("decided_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const tradeInImages = pgTable("trade_in_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  tradeInId: uuid("trade_in_id").notNull().references(() => tradeIns.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  data: bytea("data").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Referral program (migration 0025): one row per invited friend. */
export const referrals = pgTable("referrals", {
  id: uuid("id").primaryKey().defaultRandom(),
  referrerId: uuid("referrer_id").notNull().references(() => users.id),
  referredId: uuid("referred_id").notNull().unique().references(() => users.id),
  status: text("status").$type<"pending" | "rewarded" | "void">().notNull().default("pending"),
  rewardKobo: money("reward_kobo"),
  friendRewardKobo: money("friend_reward_kobo"),
  note: text("note"),
  rewardedAt: ts("rewarded_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Photos on P2P ads (migration 0026). */
export const listingImages = pgTable("listing_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  contentType: text("content_type").notNull(),
  /** Photo bytes for older photos; NULL once the photo lives in Vercel Blob (migration 0028). */
  data: bytea("data"),
  /** Public Vercel Blob URL (migration 0028). */
  url: text("url"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Flutterwave virtual account numbers for automatic bank-transfer top-ups (migration 0027). */
export const virtualAccounts = pgTable("virtual_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  kind: text("kind").$type<"onetime" | "permanent">().notNull(),
  txRef: text("tx_ref").notNull().unique(),
  accountNumber: text("account_number").notNull(),
  bankName: text("bank_name").notNull(),
  accountName: text("account_name"),
  amountKobo: money("amount_kobo"),
  expiresAt: ts("expires_at"),
  flwRef: text("flw_ref"),
  orderRef: text("order_ref"),
  status: text("status").$type<"active" | "paid" | "expired">().notNull().default("active"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** "Send a Package" shipments via Terminal Africa (migration 0029). */
export const shipments = pgTable("shipments", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  userId: uuid("user_id").notNull().references(() => users.id),
  status: text("status").$type<"quoted" | "booking" | "waiting_funds" | "booked" | "in_transit" | "delivered" | "cancelled" | "failed">().notNull().default("quoted"),
  fromAddress: jsonb("from_address").$type<Record<string, string>>().notNull(),
  toAddress: jsonb("to_address").$type<Record<string, string>>().notNull(),
  parcel: jsonb("parcel").$type<Record<string, unknown>>().notNull(),
  providerFromId: text("provider_from_id"),
  providerToId: text("provider_to_id"),
  providerParcelId: text("provider_parcel_id"),
  rates: jsonb("rates").$type<ShipRate[]>().notNull().default([]),
  rateId: text("rate_id"),
  carrier: text("carrier"),
  carrierLogo: text("carrier_logo"),
  deliveryTime: text("delivery_time"),
  priceKobo: money("price_kobo"),
  costKobo: money("cost_kobo"),
  holdId: uuid("hold_id").references(() => holds.id),
  providerShipmentId: text("provider_shipment_id"),
  carrierTracking: text("carrier_tracking"),
  trackingUrl: text("tracking_url"),
  labelUrl: text("label_url"),
  events: jsonb("events").$type<ShipEvent[]>().notNull().default([]),
  lastTrackedAt: ts("last_tracked_at"),
  error: text("error"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  deliveredAt: ts("delivered_at"),
});
export type ShipRate = { rateId: string; carrier: string; logo: string | null; service: string | null; costKobo: number; priceKobo: number; deliveryTime: string | null; pickupTime: string | null };
export type ShipEvent = { at: string; text: string; location: string | null };

/** Log of admin actions on customer accounts (migration 0030). */
export const adminActions = pgTable("admin_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminId: uuid("admin_id").notNull().references(() => users.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  detail: text("detail"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Support chat: one conversation per customer (migration 0032). */
export const supportThreads = pgTable("support_threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => users.id),
  status: text("status").$type<"open" | "closed">().notNull().default("open"),
  unreadAdmin: boolean("unread_admin").notNull().default(false),
  unreadCustomer: boolean("unread_customer").notNull().default(false),
  lastMessageAt: ts("last_message_at").notNull().defaultNow(),
  createdAt: ts("created_at").notNull().defaultNow(),
});
export const supportMessages = pgTable("support_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id").notNull().references(() => supportThreads.id, { onDelete: "cascade" }),
  sender: text("sender").$type<"customer" | "admin">().notNull(),
  adminId: uuid("admin_id").references(() => users.id),
  body: text("body").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});
