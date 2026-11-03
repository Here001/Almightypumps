/**
 * Markup rules and the minimum order amount, both editable in /admin/pricing.
 * Selling price per 1,000 = provider rate x fx x (1 + markup), rounded up, where markup is
 * the most specific of: platform+type rule, platform rule, provider default.
 */
import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { Kobo } from "@/core/money";
import type { DbOrTx } from "./db";
import { appSettings, smmPricingRules, smmProviders, smmServices } from "./db/schema";

/* ---------------- settings ---------------- */

export async function getMinOrderKobo(db: DbOrTx): Promise<Kobo> {
  const [r] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, "min_order_kobo"));
  const n = Number(r?.value ?? 0);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export async function setMinOrderKobo(db: DbOrTx, kobo: Kobo) {
  await db
    .insert(appSettings)
    .values({ key: "min_order_kobo", value: kobo })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: kobo, updatedAt: new Date() } });
  return { minOrderKobo: kobo };
}

/** Kobo per US$1 for showing dollar prices (display only; we always charge Naira). 0 = dollars off. */
export async function getUsdRateKobo(db: DbOrTx): Promise<number> {
  const [r] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, "usd_rate_kobo"));
  const n = Number(r?.value ?? 0);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export async function setUsdRateKobo(db: DbOrTx, kobo: number) {
  await db
    .insert(appSettings)
    .values({ key: "usd_rate_kobo", value: kobo })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: kobo, updatedAt: new Date() } });
  return { usdRateKobo: kobo };
}

/* ---------------- markup rules ---------------- */

export async function listRules(db: DbOrTx) {
  return db
    .select({ platform: smmPricingRules.platform, kind: smmPricingRules.kind, markupBps: smmPricingRules.markupBps, updatedAt: smmPricingRules.updatedAt })
    .from(smmPricingRules)
    .orderBy(smmPricingRules.platform, sql`${smmPricingRules.kind} NULLS FIRST`);
}

/** Set (markupBps) or remove (null) a rule, then re-price the services it covers. */
export async function setRule(db: DbOrTx, platform: string, kind: string | null, markupBps: number | null) {
  const scope = kind === null ? isNull(smmPricingRules.kind) : eq(smmPricingRules.kind, kind);
  await db.delete(smmPricingRules).where(and(eq(smmPricingRules.platform, platform), scope));
  if (markupBps !== null) await db.insert(smmPricingRules).values({ platform, kind, markupBps });
  const where = kind === null ? eq(smmServices.platform, platform) : and(eq(smmServices.platform, platform), eq(smmServices.kind, kind));
  return { repriced: await reprice(db, where) };
}

/** The markup that applies to a service row, as SQL (used inside UPDATE smm_services). */
const effectiveMarkup = sql`coalesce(
  (SELECT r.markup_bps FROM smm_pricing_rules r WHERE r.platform = ${smmServices.platform} AND r.kind = ${smmServices.kind}),
  (SELECT r.markup_bps FROM smm_pricing_rules r WHERE r.platform = ${smmServices.platform} AND r.kind IS NULL),
  (SELECT p.markup_bps FROM smm_providers p WHERE p.id = ${smmServices.providerId})
)`;

/**
 * Recompute selling prices for the services matching `where` (all if omitted) in one statement.
 * Same maths as sellRatePer1000 in src/core/smm.ts.
 */
export async function reprice(db: DbOrTx, where?: SQL): Promise<number> {
  const fx = sql`(SELECT p.fx_kobo_per_unit FROM smm_providers p WHERE p.id = ${smmServices.providerId})`;
  const res = await db
    .update(smmServices)
    .set({
      rateKobo: sql`greatest(1, ceil(${smmServices.providerRate}::numeric * ${fx} * (10000 + ${effectiveMarkup}) / 10000))::bigint`,
      updatedAt: new Date(),
    })
    .where(where)
    .returning({ id: smmServices.id });
  return res.length;
}

/** For the admin page: which markup each platform/type currently gets, and where it comes from. */
export async function pricingOverview(db: DbOrTx) {
  const [rules, groups, providers, minOrderKobo, usdRateKobo] = await Promise.all([
    listRules(db),
    db
      .select({ platform: smmServices.platform, kind: smmServices.kind, count: sql<number>`count(*)::int` })
      .from(smmServices)
      .where(sql`${smmServices.hiddenReason} IS DISTINCT FROM 'policy'`)
      .groupBy(smmServices.platform, smmServices.kind)
      .orderBy(smmServices.platform, smmServices.kind),
    db.select({ name: smmProviders.name, markupBps: smmProviders.markupBps }).from(smmProviders),
    getMinOrderKobo(db),
    getUsdRateKobo(db),
  ]);
  return { rules, groups, providers, minOrderKobo, usdRateKobo };
}
