import { getDb } from "@/server/db";
import { route } from "@/server/http";
import { categoryProducts } from "@/server/shop";

export const dynamic = "force-dynamic";

export const GET = route(async (_req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  return categoryProducts(getDb(), slug.slice(0, 80));
});
