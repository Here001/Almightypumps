/** WhatsApp agent: small pure helpers (tested in tests/core.test.ts). */

/** "LINK AB12CD" → "AB12CD" (the code from the customer's Settings page), else null. */
export function parseLinkCommand(text: string): string | null {
  const m = /^\s*link\s*[:#-]?\s*([A-Za-z0-9]{6})\s*[.!]?\s*$/i.exec(text);
  return m ? m[1].toUpperCase() : null;
}

const norm = (t: string) => t.trim().toLowerCase().replace(/[.!\s]+$/g, "");
/** The customer confirms a purchase. Only a clear yes counts, never a sentence that merely contains "yes". */
export const isYes = (t: string) => ["yes", "y", "yes please", "yes confirm", "confirm", "ok yes", "yeah", "yep"].includes(norm(t));
export const isNo = (t: string) => ["no", "n", "cancel", "stop", "no thanks", "don't", "dont"].includes(norm(t));

/** Code alphabet without look-alikes (0/O, 1/I/L). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function makeLinkCode(random: Uint8Array): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[random[i] % ALPHABET.length];
  return s;
}

/** "+234 803 123 4567" / "2348031234567" → digits only. */
export const waDigits = (p: string) => p.replace(/\D/g, "");
/** 2348031234567 → +234 ••• ••• 4567 */
export function maskPhone(digits: string): string {
  const d = waDigits(digits);
  return d.length < 7 ? "•••" : `+${d.slice(0, d.length - 10 > 0 ? d.length - 10 : 0)} ••• ••• ${d.slice(-4)}`;
}

/** Text messages in a WhatsApp Cloud API webhook body (other kinds are reported as `other`). */
export type WaIncoming = { waId: string; from: string; name: string | null; text: string | null; type: string };
export function parseWebhook(body: unknown): WaIncoming[] {
  const out: WaIncoming[] = [];
  const entries = (body as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const e of entries) {
    const changes = (e as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const c of changes) {
      const v = (c as { value?: { messages?: unknown[]; contacts?: { wa_id?: string; profile?: { name?: string } }[] } })?.value;
      if (!v || !Array.isArray(v.messages)) continue;
      for (const m of v.messages as { id?: string; from?: string; type?: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string } } }[]) {
        if (!m?.id || !m?.from) continue;
        const contact = v.contacts?.find((x) => x.wa_id === m.from) ?? v.contacts?.[0];
        const text = m.type === "text" ? m.text?.body ?? null
          : m.type === "button" ? m.button?.text ?? null
          : m.type === "interactive" ? m.interactive?.button_reply?.title ?? null : null;
        out.push({ waId: m.id, from: waDigits(m.from), name: contact?.profile?.name ?? null, text: text?.slice(0, 2000) ?? null, type: m.type ?? "unknown" });
      }
    }
  }
  return out;
}

/** WhatsApp allows 4096 characters per text message; split long replies on paragraph/line breaks. */
export function splitForWhatsApp(text: string, max = 4000): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n\n", max);
    if (cut < max / 2) cut = rest.lastIndexOf("\n", max);
    if (cut < max / 2) cut = rest.lastIndexOf(" ", max);
    if (cut < 1) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** Claude usage → micro-dollars. Prices are $ per million tokens. */
export type TokenPrices = { input: number; output: number; cacheRead: number; cacheWrite: number };
export function usageCostMicroUsd(u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }, p: TokenPrices): number {
  return Math.ceil(u.input_tokens * p.input + u.output_tokens * p.output + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite);
}

/** WhatsApp formatting: **bold** (Markdown) → *bold*, drop headings markup. */
export function toWhatsAppText(md: string): string {
  return md.replace(/\*\*(.+?)\*\*/g, "*$1*").replace(/^#{1,6}\s+/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** The whole message is one email address → lower-cased email, else null. */
export function asEmail(text: string): string | null {
  const t = text.trim().replace(/[.!]+$/, "").toLowerCase();
  return /^[^\s@<>()]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(t) && t.length <= 254 ? t : null;
}
/** The whole message is a 6-digit code ("123456", "123 456") → "123456", else null. */
export function asSixDigits(text: string): string | null {
  const m = /^\s*(\d{3})[\s-]?(\d{3})\s*$/.exec(text);
  return m ? m[1] + m[2] : null;
}
