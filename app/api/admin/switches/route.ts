import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { offServices, setService } from "@/server/serviceSwitches";
import { SWITCHES, isSwitchId } from "@/core/switches";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireAdmin();
  const off = await offServices(getDb());
  return { services: SWITCHES.map((s) => ({ ...s, on: !off.includes(s.id) })) };
});

export const POST = route(async (req: Request) => {
  await requireAdmin();
  const input = await body(req, z.object({ id: z.string().refine(isSwitchId, "Unknown service"), on: z.boolean() }));
  return setService(getDb(), input.id as never, input.on);
});
