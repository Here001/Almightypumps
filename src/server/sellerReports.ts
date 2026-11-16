/** Admin view of buyers' reports about P2P sellers (made from the trade room; see reportSeller in market.ts). */
import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "./db";
import { listings, sellerProfiles, sellerReports, trades, users } from "./db/schema";
import { badRequest, notFound } from "./errors";

export async function reportsForAdmin(db: Db, which: "open" | "closed") {
  const reporter = alias(users, "reporter");
  const seller = alias(users, "seller");
  const rows = await db
    .select({
      id: sellerReports.id, publicId: sellerReports.publicId, reason: sellerReports.reason, details: sellerReports.details,
      status: sellerReports.status, adminNote: sellerReports.adminNote, createdAt: sellerReports.createdAt, closedAt: sellerReports.closedAt,
      tradeId: trades.id, tradePublicId: trades.publicId, tradeStatus: trades.status, amount: trades.amount, title: listings.title,
      reporterId: reporter.id, reporterName: reporter.name, reporterEmail: reporter.email,
      sellerId: seller.id, sellerName: seller.name, sellerEmail: seller.email, shop: sellerProfiles.businessName, sellerSuspended: seller.suspendedAt,
      sellerReports: sql<number>`(select count(*) from seller_reports r2 where r2.seller_id = ${sellerReports.sellerId})::int`,
    })
    .from(sellerReports)
    .innerJoin(trades, eq(trades.id, sellerReports.tradeId))
    .innerJoin(listings, eq(listings.id, trades.listingId))
    .innerJoin(reporter, eq(reporter.id, sellerReports.reporterId))
    .innerJoin(seller, eq(seller.id, sellerReports.sellerId))
    .leftJoin(sellerProfiles, eq(sellerProfiles.userId, sellerReports.sellerId))
    .where(eq(sellerReports.status, which))
    .orderBy(which === "open" ? sellerReports.createdAt : desc(sellerReports.closedAt))
    .limit(100);
  return rows;
}

export async function closeReport(db: Db, id: string, adminId: string, note: string, reopen = false) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Report");
  if (note.length > 1000) throw badRequest("Keep the note under 1,000 characters.");
  const [r] = await db.update(sellerReports)
    .set(reopen ? { status: "open", closedAt: null, closedBy: null } : { status: "closed", closedAt: new Date(), closedBy: adminId, adminNote: note.trim() || null })
    .where(and(eq(sellerReports.id, id), eq(sellerReports.status, reopen ? "closed" : "open")))
    .returning();
  if (!r) throw badRequest("This report was already updated. Refresh the page.");
  return r;
}
