/**
 * Cloudflare Turnstile ("I'm not a robot" check) for log in and sign up.
 * Off until TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY are set (then every attempt needs a fresh token).
 */
import { env } from "./env";
import { AppError } from "./errors";

export const captchaSiteKey = () => (env().TURNSTILE_SECRET_KEY ? env().TURNSTILE_SITE_KEY || null : null);

export async function verifyCaptcha(token: string | undefined, ip: string) {
  const secret = env().TURNSTILE_SECRET_KEY;
  if (!secret) return; // not configured yet
  if (!token) throw new AppError(400, "CAPTCHA_REQUIRED", "Please complete the “I'm not a robot” check.");
  let ok = false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, ...(ip && ip !== "unknown" ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const j = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    ok = j.success === true;
    if (!ok) console.warn("[captcha] rejected", j["error-codes"]);
  } catch (e) {
    // Cloudflare unreachable: don't lock everyone out; rate limits still apply.
    console.error("[captcha] verify failed, allowing", e);
    return;
  }
  if (!ok) throw new AppError(400, "CAPTCHA_FAILED", "The “I'm not a robot” check expired or failed. Please try it again.");
}
