/** Admin-editable Privacy Policy and Terms (app_settings "legal_privacy" / "legal_terms"). */
import { eq } from "drizzle-orm";
import { LEGAL_DEFAULT_UPDATED, LEGAL_DEFAULTS, type LegalKind } from "@/content/legal";
import type { DbOrTx } from "./db";
import { appSettings } from "./db/schema";
import { badRequest } from "./errors";

type Stored = { body: string; updated: string };
const key = (k: LegalKind) => `legal_${k}`;

/** The text to show, its "last updated" date (YYYY-MM-DD), and whether it was edited in the admin. */
export async function getLegal(db: DbOrTx, kind: LegalKind) {
  const [r] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key(kind)));
  const v = r?.value as Stored | undefined;
  if (v?.body) return { body: v.body, updated: v.updated, edited: true };
  return { body: LEGAL_DEFAULTS[kind], updated: LEGAL_DEFAULT_UPDATED, edited: false };
}

const lagosToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());

export async function saveLegal(db: DbOrTx, kind: LegalKind, body: string) {
  const text = body.replace(/\r\n?/g, "\n").trim();
  if (text.length < 50) throw badRequest("That's too short to be a full policy. Add the text, or use “Reset to original”.");
  if (text.length > 60_000) throw badRequest("That's too long (max 60,000 characters).");
  const value: Stored = { body: text, updated: lagosToday() };
  await db.insert(appSettings).values({ key: key(kind), value }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  return { updated: value.updated };
}

/** Back to the original text (the edited version is removed). */
export async function resetLegal(db: DbOrTx, kind: LegalKind) {
  await db.delete(appSettings).where(eq(appSettings.key, key(kind)));
  return { reset: true };
}

export const formatLegalDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
