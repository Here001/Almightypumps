import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { updateProvider } from "@/server/smm";

export const dynamic = "force-dynamic";

const schema = z.object({
  // Percent on top of the provider's price, e.g. 50 means sell at 1.5x. Whole or .5 steps are fine.
  markupPercent: z.coerce.number().min(0, "Markup can't be negative.").max(500, "Markup can't be more than 500%.").optional(),
  active: z.boolean().optional(),
});

/** Change a provider's markup (re-prices its services) or pause/resume it. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await requireAdmin();
  const input = await body(req, schema);
  return updateProvider(getDb(), id, {
    markupBps: input.markupPercent === undefined ? undefined : Math.round(input.markupPercent * 100),
    active: input.active,
  });
});
