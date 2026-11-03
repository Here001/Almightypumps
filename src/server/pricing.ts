/**
 * Markup rules and the minimum order amount, both editable in /admin/pricing.
 * Selling price per 1,000 = provider rate x fx x (1 + markup), rounded up, where markup is
 * the most specific of: platform+type rule, platform rule, provider default.
 */
import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { Kobo } from "@/core/money";
import { DEFAULT_USD_CONFIG, effectiveUsdRate, parseUsdNgn, type UsdConfig } from "@/core/currency";
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

/* ---------------- dollar display rate ---------------- */

const FX_URL = process.env.FX_RATE_URL || "https://open.er-api.com/v6/latest/USD";
const FX_MAX_AGE_MS = 6 * 60 * 60 * 1000; // refresh automatic rates every 6 hours

export async function getUsdConfig(db: DbOrTx): Promise<UsdConfig> {
  const rows = await db.select({ key: appSettings.key, value: appSettings.value }).from(appSettings)
    .where(sql`${appSettings.key} IN ('usd', 'usd_rate_kobo')`);
  const cfg = rows.find((r) => r.key === "usd")?.value as Partial<UsdConfig> | undefined;
  if (cfg) return { ...DEFAULT_USD_CONFIG, ...cfg };
  // Older builds stored a single manual rate.
  const legacy = Number(rows.find((r) => r.key === "usd_rate_kobo")?.value ?? 0);
  return legacy > 0 ? { ...DEFAULT_USD_CONFIG, mode: "manual", manualKobo: legacy } : { ...DEFAULT_USD_CONFIG };
}

async function saveUsdConfig(db: DbOrTx, cfg: UsdConfig) {
  await db
    .insert(appSettings)
    .values({ key: "usd", value: cfg })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: cfg, updatedAt: new Date() } });
}

/** Kobo per US$1 that customers see; 0 = dollar prices off. */
export async function getUsdRateKobo(db: DbOrTx): Promise<number> {
  return effectiveUsdRate(await getUsdConfig(db));
}

/**
 * In automatic mode, fetch the market rate if it's older than 6 hours (or `force`).
 * A failed fetch keeps the last good rate and records the error for the admin page.
 */
export async function refreshUsdRate(db: DbOrTx, opts: { force?: boolean } = {}) {
  const cfg = await getUsdConfig(db);
  if (cfg.mode !== "auto") return { cfg, refreshed: false };
  const age = cfg.updatedAt ? Date.now() - new Date(cfg.updatedAt).getTime() : Infinity;
  if (!opts.force && age < FX_MAX_AGE_MS && cfg.marketKobo > 0) return { cfg, refreshed: false };
  try {
    const res = await fetch(FX_URL, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const marketKobo = parseUsdNgn(await res.json());
    const next: UsdConfig = { ...cfg, marketKobo, updatedAt: new Date().toISOString(), source: new URL(FX_URL).hostname, lastError: null };
    await saveUsdConfig(db, next);
    return { cfg: next, refreshed: true };
  } catch (e) {
    const next: UsdConfig = { ...cfg, lastError: `${new Date().toISOString()}: ${(e as Error).message}`.slice(0, 200) };
    await saveUsdConfig(db, next);
    return { cfg: next, refreshed: false };
  }
}

/** Admin changes: switch mode, set the manual rate, or the automatic adjustment. */
export async function updateUsdConfig(db: DbOrTx, input: { mode?: "auto" | "manual"; manualKobo?: number; adjustBps?: number }) {
  const cfg = await getUsdConfig(db);
  const next: UsdConfig = {
    ...cfg,
    mode: input.mode ?? cfg.mode,
    manualKobo: input.manualKobo ?? cfg.manualKobo,
    adjustBps: input.adjustBps ?? cfg.adjustBps,
  };
  await saveUsdConfig(db, next);
  // Switching to automatic with no rate yet: fetch straight away.
  if (next.mode === "auto" && !(next.marketKobo > 0)) return (await refreshUsdRate(db, { force: true })).cfg;
  return next;
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
  const [rules, groups, providers, minOrderKobo, usd] = await Promise.all([
    listRules(db),
    db
      .select({ platform: smmServices.platform, kind: smmServices.kind, count: sql<number>`count(*)::int` })
      .from(smmServices)
      .where(sql`${smmServices.hiddenReason} IS DISTINCT FROM 'policy'`)
      .groupBy(smmServices.platform, smmServices.kind)
      .orderBy(smmServices.platform, smmServices.kind),
    db.select({ name: smmProviders.name, markupBps: smmProviders.markupBps }).from(smmProviders),
    getMinOrderKobo(db),
    getUsdConfig(db),
  ]);
  return { rules, groups, providers, minOrderKobo, usd: { ...usd, effectiveKobo: effectiveUsdRate(usd) } };
}
