import { getDb } from "@/server/db";
import { route } from "@/server/http";
import { listServices } from "@/server/smm";

export const dynamic = "force-dynamic";

export const GET = route(async () => listServices(getDb()));
