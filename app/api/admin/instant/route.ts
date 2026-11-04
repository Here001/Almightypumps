import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { adminRefundGift, giftAdminOverview, setGiftFlags, syncGiftProducts, updateGiftConfig } from "@/server/giftCards";
import { adminRefundTopup, airtimeAdminOverview, refreshOperators, updateAirtimeConfig } from "@/server/airtime";
import { adminRefundTravel, setTravelHidden, syncTravelPackages, travelAdminOverview, updateTravelConfig } from "@/server/travelEsim";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** ?tab=gift|airtime|travel&q=search */
export const GET = route(async (req: Request) => {
  await requireAdmin();
  const p = new URL(req.url).searchParams;
  const q = p.get("q") || undefined;
  const db = getDb();
  if (p.get("tab") === "airtime") return airtimeAdminOverview(db);
  if (p.get("tab") === "travel") return travelAdminOverview(db, q);
  return giftAdminOverview(db, q);
});

const pct = z.number().min(0).max(1000);
const bps = (v: number | undefined) => (v === undefined ? undefined : Math.round(v * 100));

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("giftConfig"), markupPercent: pct.optional(), enabled: z.boolean().optional(), countries: z.array(z.string()).max(40).optional() }),
  z.object({ action: z.literal("giftSync") }),
  z.object({ action: z.literal("giftFlags"), ids: z.array(z.number().int()).max(500), hidden: z.boolean().optional(), featured: z.boolean().optional() }),
  z.object({ action: z.literal("giftRefund"), id: z.string().uuid() }),
  z.object({ action: z.literal("airtimeConfig"), airtimeMarkupPercent: pct.optional(), dataMarkupPercent: pct.optional(), enabled: z.boolean().optional() }),
  z.object({ action: z.literal("airtimeRefresh") }),
  z.object({ action: z.literal("airtimeRefund"), id: z.string().uuid() }),
  z.object({ action: z.literal("travelConfig"), markupPercent: pct.optional(), enabled: z.boolean().optional() }),
  z.object({ action: z.literal("travelSync") }),
  z.object({ action: z.literal("travelHide"), codes: z.array(z.string()).max(500), hidden: z.boolean() }),
  z.object({ action: z.literal("travelRefund"), id: z.string().uuid() }),
]);

export const POST = route(async (req: Request) => {
  await requireAdmin();
  const i = await body(req, schema);
  const db = getDb();
  switch (i.action) {
    case "giftConfig": return updateGiftConfig(db, { markupBps: bps(i.markupPercent), enabled: i.enabled, countries: i.countries });
    case "giftSync": return syncGiftProducts(db);
    case "giftFlags": return setGiftFlags(db, i.ids, { hidden: i.hidden, featured: i.featured });
    case "giftRefund": return adminRefundGift(db, i.id);
    case "airtimeConfig": return updateAirtimeConfig(db, { airtimeMarkupBps: bps(i.airtimeMarkupPercent), dataMarkupBps: bps(i.dataMarkupPercent), enabled: i.enabled });
    case "airtimeRefresh": return refreshOperators(db);
    case "airtimeRefund": return adminRefundTopup(db, i.id);
    case "travelConfig": return updateTravelConfig(db, { markupBps: bps(i.markupPercent), enabled: i.enabled });
    case "travelSync": return syncTravelPackages(db);
    case "travelHide": return setTravelHidden(db, i.codes, i.hidden);
    case "travelRefund": return adminRefundTravel(db, i.id);
  }
});
