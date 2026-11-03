import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { removeSellerAvatar, sellerAvatarUrl, setSellerAvatar } from "@/server/sellers";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();
  return { avatarUrl: await sellerAvatarUrl(getDb(), user.id) };
});

/** Upload or replace the shop picture: { image: "data:image/webp;base64,..." }. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const { image } = await body(req, z.object({ image: z.string().max(450_000, "That picture is too big. Try a smaller one.") }));
  return setSellerAvatar(getDb(), user.id, image);
});

export const DELETE = route(async () => {
  const user = await requireUser();
  return removeSellerAvatar(getDb(), user.id);
});
