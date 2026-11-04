import { z } from "zod";
import { LEGAL_DEFAULTS } from "@/content/legal";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { getLegal, resetLegal, saveLegal } from "@/server/legal";

export const dynamic = "force-dynamic";

/** Both pages' current text (and the originals, for "Reset"). */
export const GET = route(async () => {
  await requireAdmin();
  const db = getDb();
  const [privacy, terms] = await Promise.all([getLegal(db, "privacy"), getLegal(db, "terms")]);
  return { privacy, terms, defaults: LEGAL_DEFAULTS };
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), kind: z.enum(["privacy", "terms"]), body: z.string().max(60_000, "That's too long (max 60,000 characters).") }),
  z.object({ action: z.literal("reset"), kind: z.enum(["privacy", "terms"]) }),
]);

export const POST = route(async (req: Request) => {
  await requireAdmin();
  const input = await body(req, schema);
  return input.action === "save" ? saveLegal(getDb(), input.kind, input.body) : resetLegal(getDb(), input.kind);
});
