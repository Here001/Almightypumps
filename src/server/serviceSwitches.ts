/** Admin on/off switches for whole services. Stored as the list of services that are OFF (everything else is on). */
import type { DbOrTx } from "./db";
import { readSetting, writeSetting } from "./appSettings";
import { AppError } from "./errors";
import { SWITCHES, isSwitchId, type SwitchId } from "@/core/switches";

export async function offServices(db: DbOrTx): Promise<SwitchId[]> {
  const s = await readSetting<{ off: string[] }>(db, "services_off", { off: [] });
  return (Array.isArray(s.off) ? s.off : []).filter(isSwitchId);
}

export async function setService(db: DbOrTx, id: SwitchId, on: boolean) {
  const off = new Set(await offServices(db));
  if (on) off.delete(id); else off.add(id);
  await writeSetting(db, "services_off", { off: [...off] });
  return { off: [...off] };
}

/** Refuse new orders for a service that's switched off. */
export async function assertServiceOn(db: DbOrTx, id: SwitchId) {
  if ((await offServices(db)).includes(id)) {
    const label = SWITCHES.find((s) => s.id === id)?.label ?? "This service";
    throw new AppError(503, "SERVICE_OFF", `${label} is unavailable right now. Please check back later.`);
  }
}

/** The admin's tile order for the customer Services page (ids like "boost" or "shop-<slug>"). */
export async function tileOrder(db: DbOrTx): Promise<string[]> {
  const s = await readSetting<{ order: string[] }>(db, "services_order", { order: [] });
  return (Array.isArray(s.order) ? s.order : []).filter((x) => typeof x === "string" && /^[a-z0-9_-]{1,80}$/.test(x)).slice(0, 100);
}
export async function saveTileOrder(db: DbOrTx, order: string[]) {
  await writeSetting(db, "services_order", { order: [...new Set(order)].slice(0, 100) });
  return { order };
}
