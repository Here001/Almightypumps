/** Admin on/off switches for whole services. Stored as the list of services that are OFF (everything else is on). */
import type { DbOrTx } from "./db";
import { readSetting, writeSetting } from "./appSettings";
import { AppError } from "./errors";
import { DEFAULT_OFF, SWITCHES, isSwitchId, type SwitchId } from "@/core/switches";

type Stored = { off: string[]; on: string[] };
const stored = async (db: DbOrTx): Promise<Stored> => {
  const s = await readSetting<Stored>(db, "services_off", { off: [], on: [] });
  return { off: Array.isArray(s.off) ? s.off : [], on: Array.isArray(s.on) ? s.on : [] };
};

/** Services that are off: the ones switched off, plus default-off ones (e.g. the reseller API) not yet switched on. */
export async function offServices(db: DbOrTx): Promise<SwitchId[]> {
  const s = await stored(db);
  const off = new Set(s.off.filter(isSwitchId));
  for (const id of DEFAULT_OFF) if (!s.on.includes(id) && isSwitchId(id)) off.add(id);
  return [...off];
}

export async function setService(db: DbOrTx, id: SwitchId, on: boolean) {
  const s = await stored(db);
  const off = new Set(s.off), onSet = new Set(s.on);
  if (on) { off.delete(id); if (DEFAULT_OFF.includes(id)) onSet.add(id); } else { off.add(id); onSet.delete(id); }
  await writeSetting(db, "services_off", { off: [...off], on: [...onSet] });
  return { off: await offServices(db) };
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
