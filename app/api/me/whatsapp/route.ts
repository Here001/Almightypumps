import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";
import { myWhatsApp, newLinkCode, unlinkWhatsApp } from "@/server/whatsapp";

export const dynamic = "force-dynamic";

/** Is my WhatsApp linked? */
export const GET = route(async () => {
  const user = await requireUser();
  return myWhatsApp(getDb(), user.id);
});

/** { action: "code" } = new 6-character link code (15 min); { action: "unlink" }. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const { action } = await body(req, z.object({ action: z.enum(["code", "unlink"]) }));
  if (action === "unlink") return unlinkWhatsApp(getDb(), user.id);
  await rateLimit(getDb(), "whatsappLink", `code:${user.id}`);
  return newLinkCode(getDb(), user.id);
});
