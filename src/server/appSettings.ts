/** Small JSON settings stored in app_settings (one row per key), merged over defaults. */
import { eq } from "drizzle-orm";
import type { DbOrTx } from "./db";
import { appSettings } from "./db/schema";

export async function readSetting<T extends object>(db: DbOrTx, key: string, defaults: T): Promise<T> {
  const [r] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key));
  return { ...defaults, ...((r?.value as Partial<T>) ?? {}) };
}

export async function writeSetting<T extends object>(db: DbOrTx, key: string, value: T) {
  await db.insert(appSettings).values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  return value;
}
