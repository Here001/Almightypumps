import { getDb } from "@/server/db";
import { callerKey, rateLimit } from "@/server/rateLimit";
import { route } from "@/server/http";
import { categoryProducts } from "@/server/shop";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  await rateLimit(getDb(), "catalogIp", callerKey(req));
  return categoryProducts(getDb(), slug.slice(0, 80));
});
