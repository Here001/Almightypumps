import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { editProvider, removeProvider, updateProvider } from "@/server/smm";

export const dynamic = "force-dynamic";

const schema = z.object({
  // Percent on top of the provider's price, e.g. 50 means sell at 1.5x. Whole or .5 steps are fine.
  markupPercent: z.coerce.number().min(0, "Markup can't be negative.").max(500, "Markup can't be more than 500%.").optional(),
  active: z.boolean().optional(),
  name: z.string().trim().min(2).max(60).optional(),
  apiUrl: z.string().trim().url().refine((u) => u.startsWith("https://") || /^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(u), "The API URL must start with https://").optional(),
  apiKey: z.string().trim().min(8, "Paste the API key").optional(),
  /** ₦ per 1 unit of the panel's currency; null = follow the site's dollar rate. */
  nairaPerUnit: z.coerce.number().positive().max(1_000_000).nullable().optional(),
});

/** Change a provider's markup (re-prices its services) or pause/resume it. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await requireAdmin();
  const input = await body(req, schema);
  const db = getDb();
  if (input.name || input.apiUrl || input.apiKey || input.nairaPerUnit !== undefined) {
    return editProvider(db, id, {
      name: input.name, apiUrl: input.apiUrl, apiKey: input.apiKey,
      fxKoboPerUnit: input.nairaPerUnit === undefined ? undefined : input.nairaPerUnit === null ? null : Math.round(input.nairaPerUnit * 100),
    });
  }
  return updateProvider(db, id, {
    markupBps: input.markupPercent === undefined ? undefined : Math.round(input.markupPercent * 100),
    active: input.active,
  });
});

/** Delete a provider that was never used (otherwise disconnect it). */
export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await requireAdmin();
  return removeProvider(getDb(), id);
});
