/**
 * Admin money tools: withdrawal queue (paid out manually by bank transfer),
 * P2P disputes, and the platform wallet (what the business has earned).
 */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { NG_BANKS } from "@/core/banks";
import type { Db } from "./db";
import { disputes, ledgerEntries, listings, sellerProfiles, tradeEvents, tradeMessages, trades, users, wallets, withdrawals } from "./db/schema";
import { notFound } from "./errors";
import { platformWalletId } from "./wallet";

const bankName = (code: string) => NG_BANKS.find((b) => b.code === code)?.name ?? `Bank ${code}`;

/* ---------- Withdrawals ---------- */

export async function withdrawalsForAdmin(db: Db, status: "requested" | "paid" | "rejected") {
  const rows = await db
    .select({
      id: withdrawals.id, amount: withdrawals.amount, status: withdrawals.status, note: withdrawals.note,
      bankCode: withdrawals.bankCode, accountNumber: withdrawals.accountNumber, accountName: withdrawals.accountName,
      createdAt: withdrawals.createdAt, decidedAt: withdrawals.decidedAt,
      userId: users.id, name: users.name, email: users.email, phone: users.phone, joinedAt: users.createdAt, sellerStatus: users.sellerStatus,
      sellerAccountNumber: sellerProfiles.accountNumber, sellerAccountName: sellerProfiles.accountName, sellerBankCode: sellerProfiles.bankCode,
    })
    .from(withdrawals)
    .innerJoin(users, eq(users.id, withdrawals.userId))
    .leftJoin(sellerProfiles, eq(sellerProfiles.userId, withdrawals.userId))
    .where(eq(withdrawals.status, status))
    .orderBy(status === "requested" ? withdrawals.createdAt : desc(withdrawals.decidedAt))
    .limit(100);
  if (rows.length === 0) return [];

  // Where the person's money came from: top-ups vs. sales. Withdrawing money that was only
  // just topped up (and never spent) is the classic stolen-card pattern, so we flag it.
  const ids = [...new Set(rows.map((r) => r.userId))];
  const sources = await db
    .select({
      userId: wallets.userId,
      deposits: sql<number>`coalesce(sum(${ledgerEntries.availableChange}) filter (where ${ledgerEntries.kind} = 'deposit'), 0)::bigint`,
      sales: sql<number>`coalesce(sum(${ledgerEntries.availableChange}) filter (where ${ledgerEntries.kind} = 'escrow:payout'), 0)::bigint`,
      spent: sql<number>`coalesce(-sum(${ledgerEntries.heldChange}) filter (where ${ledgerEntries.kind} like 'capture:%' and ${ledgerEntries.kind} <> 'capture:withdrawal'), 0)::bigint`,
      lastDeposit: sql<string | null>`max(${ledgerEntries.createdAt}) filter (where ${ledgerEntries.kind} = 'deposit')`,
      available: wallets.available,
    })
    .from(wallets)
    .leftJoin(ledgerEntries, eq(ledgerEntries.walletId, wallets.id))
    .where(inArray(wallets.userId, ids))
    .groupBy(wallets.userId, wallets.available);
  const byUser = new Map(sources.map((s) => [s.userId, s]));

  return rows.map((r) => {
    const s = byUser.get(r.userId);
    const deposits = Number(s?.deposits ?? 0), sales = Number(s?.sales ?? 0), spent = Number(s?.spent ?? 0);
    const flags: string[] = [];
    if (r.status === "requested") {
      if (sales === 0 && spent < deposits * 0.2) flags.push("Mostly unspent top-up money (no sales). Check before paying: could be a stolen card.");
      if (s?.lastDeposit && Date.now() - Date.parse(s.lastDeposit) < 24 * 3600_000) flags.push("Topped up in the last 24 hours.");
      if (Date.now() - r.joinedAt.getTime() < 3 * 24 * 3600_000) flags.push("Account is less than 3 days old.");
      if (r.sellerAccountNumber && r.sellerAccountNumber !== r.accountNumber) flags.push(`Different account from the one on their seller profile (${bankName(r.sellerBankCode ?? "")} ${r.sellerAccountNumber}, ${r.sellerAccountName}).`);
    }
    return {
      id: r.id, amount: r.amount, status: r.status, note: r.note, createdAt: r.createdAt, decidedAt: r.decidedAt,
      bankName: bankName(r.bankCode), accountNumber: r.accountNumber, accountName: r.accountName,
      user: { id: r.userId, name: r.name, email: r.email, phone: r.phone, joinedAt: r.joinedAt, seller: r.sellerStatus === "verified" },
      money: { deposits, sales, spent, available: Number(s?.available ?? 0) },
      flags,
    };
  });
}

/* ---------- Disputes ---------- */

export async function disputesForAdmin(db: Db, which: "open" | "resolved") {
  const rows = await db
    .select({
      id: trades.id, publicId: trades.publicId, status: trades.status, amount: trades.amount, quantity: trades.quantity,
      deliveryProof: trades.deliveryProof, createdAt: trades.createdAt, shippedAt: trades.shippedAt,
      title: listings.title, listingId: listings.id,
      reason: disputes.reason, openedAt: disputes.createdAt, resolution: disputes.resolution, resolvedAt: disputes.resolvedAt,
      buyerId: trades.buyerId, sellerId: trades.sellerId,
    })
    .from(trades)
    .innerJoin(listings, eq(listings.id, trades.listingId))
    .innerJoin(disputes, eq(disputes.tradeId, trades.id))
    .where(which === "open" ? eq(trades.status, "DISPUTED") : sql`${disputes.resolvedAt} is not null`)
    .orderBy(which === "open" ? disputes.createdAt : desc(disputes.resolvedAt))
    .limit(100);
  if (rows.length === 0) return [];
  const people = await db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, shop: sellerProfiles.businessName, shopPhone: sellerProfiles.contactPhone })
    .from(users).leftJoin(sellerProfiles, eq(sellerProfiles.userId, users.id))
    .where(inArray(users.id, [...new Set(rows.flatMap((r) => [r.buyerId, r.sellerId]))]));
  const who = new Map(people.map((p) => [p.id, p]));
  const tradeIds = rows.map((r) => r.id);
  const [events, messages] = await Promise.all([
    db.select({ tradeId: tradeEvents.tradeId, action: tradeEvents.action, note: tradeEvents.note, at: tradeEvents.createdAt, actorId: tradeEvents.actorId })
      .from(tradeEvents).where(inArray(tradeEvents.tradeId, tradeIds)).orderBy(tradeEvents.createdAt),
    db.select({ tradeId: tradeMessages.tradeId, senderId: tradeMessages.senderId, body: tradeMessages.body, at: tradeMessages.createdAt })
      .from(tradeMessages).where(inArray(tradeMessages.tradeId, tradeIds)).orderBy(tradeMessages.createdAt),
  ]);
  return rows.map((r) => {
    const b = who.get(r.buyerId), s = who.get(r.sellerId);
    const role = (id: string | null) => (id === r.buyerId ? "Buyer" : id === r.sellerId ? "Seller" : id ? "Admin" : "System");
    return {
      ...r,
      buyer: { name: b?.name ?? "?", email: b?.email ?? "", phone: b?.phone ?? null },
      seller: { name: s?.shop ?? s?.name ?? "?", email: s?.email ?? "", phone: s?.shopPhone ?? s?.phone ?? null },
      timeline: events.filter((e) => e.tradeId === r.id).map((e) => ({ action: e.action, note: e.note, at: e.at, by: role(e.actorId) })),
      messages: messages.filter((m) => m.tradeId === r.id).map((m) => ({ body: m.body, at: m.at, by: role(m.senderId) })),
    };
  });
}

/* ---------- Platform wallet ---------- */

const SOURCES: Record<string, string> = {
  "revenue:smm": "Boost Account sales",
  "revenue:sms_verify": "Verification code sales",
  "revenue:shop": "Shop sales",
  "fee:escrow": "P2P fees (3%)",
};

export async function platformOverview(db: Db) {
  const platformId = await platformWalletId(db);
  const [w] = await db.select({ available: wallets.available, held: wallets.held }).from(wallets).where(eq(wallets.id, platformId));
  if (!w) throw notFound("Platform wallet");
  const day = new Date(Date.now() - 24 * 3600_000), week = new Date(Date.now() - 7 * 24 * 3600_000), month = new Date(Date.now() - 30 * 24 * 3600_000);
  const by = await db
    .select({
      kind: ledgerEntries.kind,
      all: sql<number>`sum(${ledgerEntries.availableChange})::bigint`,
      d1: sql<number>`coalesce(sum(${ledgerEntries.availableChange}) filter (where ${ledgerEntries.createdAt} >= ${day}), 0)::bigint`,
      d7: sql<number>`coalesce(sum(${ledgerEntries.availableChange}) filter (where ${ledgerEntries.createdAt} >= ${week}), 0)::bigint`,
      d30: sql<number>`coalesce(sum(${ledgerEntries.availableChange}) filter (where ${ledgerEntries.createdAt} >= ${month}), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.walletId, platformId))
    .groupBy(ledgerEntries.kind);
  const sources = by
    .map((r) => ({ kind: r.kind, label: SOURCES[r.kind] ?? r.kind, all: Number(r.all), d1: Number(r.d1), d7: Number(r.d7), d30: Number(r.d30), count: r.count }))
    .sort((a, b) => b.all - a.all);

  // Customer money the business is holding (it isn't yours: it's owed to customers).
  const [cust] = await db
    .select({ available: sql<number>`coalesce(sum(${wallets.available}), 0)::bigint`, held: sql<number>`coalesce(sum(${wallets.held}), 0)::bigint` })
    .from(wallets).innerJoin(users, eq(users.id, wallets.userId)).where(eq(users.isSystem, false));
  const [pending] = await db
    .select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${withdrawals.amount}), 0)::bigint` })
    .from(withdrawals).where(eq(withdrawals.status, "requested"));
  const [deposits] = await db
    .select({ d30: sql<number>`coalesce(sum(${ledgerEntries.availableChange}), 0)::bigint` })
    .from(ledgerEntries).where(and(eq(ledgerEntries.kind, "deposit"), gte(ledgerEntries.createdAt, month)));
  const [openDisputes] = await db.select({ n: sql<number>`count(*)::int` }).from(trades).where(eq(trades.status, "DISPUTED"));

  const recent = await db
    .select({ kind: ledgerEntries.kind, amount: ledgerEntries.availableChange, memo: ledgerEntries.memo, refType: ledgerEntries.refType, at: ledgerEntries.createdAt })
    .from(ledgerEntries).where(eq(ledgerEntries.walletId, platformId)).orderBy(desc(ledgerEntries.createdAt)).limit(25);

  return {
    balance: { available: Number(w.available), held: Number(w.held) },
    sources,
    customers: { available: Number(cust.available), held: Number(cust.held) },
    pendingWithdrawals: { count: pending.n, total: Number(pending.total) },
    deposits30d: Number(deposits.d30),
    openDisputes: openDisputes.n,
    recent: recent.map((r) => ({ ...r, amount: Number(r.amount), label: SOURCES[r.kind] ?? r.kind })),
  };
}
