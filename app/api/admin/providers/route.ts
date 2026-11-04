import { z } from "zod";
import { getDb } from "@/server/db";
import { smmProviders } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { addProvider, testPanel } from "@/server/smm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = route(async () => {
  await requireAdmin();
  // Never send keys (even encrypted) to the browser.
  return getDb().select({
    id: smmProviders.id, name: smmProviders.name, apiUrl: smmProviders.apiUrl, currency: smmProviders.currency,
    markupBps: smmProviders.markupBps, active: smmProviders.active, apiKeyHint: smmProviders.apiKeyHint,
  }).from(smmProviders);
});

const schema = z.object({
  action: z.enum(["test", "add"]).default("add"),
  name: z.string().trim().min(2, "Give the provider a name").max(60),
  apiUrl: z.string().trim().url("Paste the full API URL, e.g. https://panel.com/api/v2").refine((u) => u.startsWith("https://") || /^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(u), "The API URL must start with https://"),
  apiKey: z.string().trim().min(8, "Paste the API key"),
  currency: z.string().trim().length(3).default("NGN"),
  /** ₦ per 1 unit of the panel's currency; leave empty to follow the site's dollar rate. */
  nairaPerUnit: z.coerce.number().positive().max(1_000_000).optional(),
  markupPercent: z.coerce.number().min(0).max(500).default(50),
});

/** Test a panel's API, or add it as a provider (the key is stored encrypted). */
export const POST = route(async (req: Request) => {
  await requireAdmin();
  const i = await body(req, schema);
  if (i.action === "test") return testPanel(i.apiUrl, i.apiKey);
  return addProvider(getDb(), {
    name: i.name, apiUrl: i.apiUrl, apiKey: i.apiKey, currency: i.currency.toUpperCase(),
    fxKoboPerUnit: i.nairaPerUnit ? Math.round(i.nairaPerUnit * 100) : undefined,
    markupBps: Math.round(i.markupPercent * 100),
  });
});
