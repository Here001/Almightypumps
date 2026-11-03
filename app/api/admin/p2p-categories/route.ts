import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { allCategories, saveListingCategory } from "@/server/listingCategories";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireAdmin();
  return allCategories(getDb());
});

const schema = z.object({
  slug: z.string().max(80).optional(),
  name: z.string().min(2).max(60),
  description: z.string().max(300).optional(),
  requiresReview: z.boolean().optional(),
  active: z.boolean().optional(),
  questions: z.array(z.object({
    id: z.string().max(60).optional(),
    label: z.string().max(200),
    type: z.string().max(20),
    required: z.boolean().optional(),
    options: z.union([z.string().max(3000), z.array(z.string().max(100))]).optional(),
    help: z.string().max(300).optional(),
  })).max(30).optional(),
});

/** Create or update a P2P category and its seller questions. */
export const POST = route(async (req: Request) => {
  await requireAdmin();
  return saveListingCategory(getDb(), await body(req, schema));
});
