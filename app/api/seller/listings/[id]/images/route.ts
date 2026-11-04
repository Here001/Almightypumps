import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { addListingImage, makeCover, removeListingImage } from "@/server/listingImages";
import { rateLimit } from "@/server/rateLimit";
import { notFound } from "@/server/errors";

export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), image: z.string().max(700_000, "That photo is too big. Try a smaller one.") }),
  z.object({ action: z.literal("remove"), imageId: z.string().uuid() }),
  z.object({ action: z.literal("cover"), imageId: z.string().uuid() }),
]);

/** Add, remove or reorder the photos on one of my ads. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Ad");
  const db = getDb();
  const input = await body(req, schema);
  if (input.action === "add") {
    await rateLimit(db, "listingPhoto", user.id);
    return addListingImage(db, user.id, id, input.image);
  }
  if (input.action === "remove") return removeListingImage(db, user.id, id, input.imageId);
  return makeCover(db, user.id, id, input.imageId);
});
