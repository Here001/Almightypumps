/** Fixed-window rate limiting maths (no dependencies; tested). */

/** Start of the window that `nowMs` falls in. */
export function windowStart(nowMs: number, windowSec: number): number {
  const w = windowSec * 1000;
  return Math.floor(nowMs / w) * w;
}

/** Seconds until the current window ends (at least 1). */
export function retryAfterSec(nowMs: number, windowSec: number): number {
  return Math.max(1, Math.ceil((windowStart(nowMs, windowSec) + windowSec * 1000 - nowMs) / 1000));
}

/** "about 3 minutes" style wait text for error messages. */
export function waitText(sec: number): string {
  if (sec < 60) return `${sec} second${sec === 1 ? "" : "s"}`;
  const m = Math.ceil(sec / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.ceil(m / 60);
  return `${h} hour${h === 1 ? "" : "s"}`;
}
