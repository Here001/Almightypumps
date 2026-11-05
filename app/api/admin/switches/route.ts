import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { offServices, saveTileOrder, setService, tileOrder } from "@/server/serviceSwitches";
import { hubCategories } from "@/server/shop";
import { HUB_SERVICES } from "@/components/dashboard/services";
import { SWITCHES, isSwitchId, sortByOrder } from "@/core/switches";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireAdmin();
  const db = getDb();
  const [off, order, shop] = await Promise.all([offServices(db), tileOrder(db), hubCategories(db)]);
  // Every tile customers can see on the Services page, in the current order.
  const tiles = sortByOrder([
    ...HUB_SERVICES.filter((s) => s.status === "live").map((s) => ({ id: s.id, label: s.title })),
    ...shop.map((c) => ({ id: `shop-${c.slug}`, label: `${c.name} (shop)` })),
  ], order);
  return { services: SWITCHES.map((s) => ({ ...s, on: !off.includes(s.id) })), tiles };
});

export const POST = route(async (req: Request) => {
  await requireAdmin();
  const input = await body(req, z.union([
    z.object({ id: z.string().refine(isSwitchId, "Unknown service"), on: z.boolean() }),
    z.object({ order: z.array(z.string().regex(/^[a-z0-9_-]{1,80}$/)).max(100) }),
  ]));
  if ("order" in input) return saveTileOrder(getDb(), input.order);
  return setService(getDb(), input.id as never, input.on);
});
