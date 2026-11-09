import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "./db";
import { env } from "./env";
import { AppError, badRequest, toAppError } from "./errors";
import { callerKey, clientIp, rateLimit } from "./rateLimit";

/* ---------- Site-wide throttle (every API request) ----------
 * 1) A per-server-instance burst limit per network (in memory, free): stops floods before they touch the database.
 * 2) A shared limit on changes (POST/DELETE…) per network, counted in Postgres across all instances.
 * Payment webhooks and cron jobs are exempt (they are signed / use a secret).
 */
const BURST = { read: 240, write: 60, netRead: 3_000, netWrite: 600, windowMs: 60_000 };
const burst = new Map<string, { start: number; reads: number; writes: number }>();
const EXEMPT = /^\/api\/(webhooks|cron)\//;

function burstCheck(key: string, write: boolean, maxRead: number, maxWrite: number) {
  const now = Date.now();
  let b = burst.get(key);
  if (!b || now - b.start > BURST.windowMs) {
    if (burst.size > 20_000) burst.clear(); // keep memory bounded
    b = { start: now, reads: 0, writes: 0 };
    burst.set(key, b);
  }
  if (write) b.writes++; else b.reads++;
  if (b.reads > maxRead || b.writes > maxWrite) {
    const wait = Math.max(1, Math.ceil((b.start + BURST.windowMs - now) / 1000));
    throw new AppError(429, "RATE_LIMITED", `Too many requests. Please wait ${wait} seconds and try again.`, { retryAfterSec: wait });
  }
}

async function throttle(req: Request) {
  const path = new URL(req.url).pathname;
  if (EXEMPT.test(path)) return;
  const ip = clientIp(req);
  const who = callerKey(req);
  const write = req.method !== "GET" && req.method !== "HEAD";
  burstCheck(who, write, BURST.read, BURST.write);                         // per customer (or visitor network)
  if (ip !== "unknown") burstCheck(`net:${ip}`, write, BURST.netRead, BURST.netWrite); // whole network ceiling
  if (write) {
    await rateLimit(getDb(), "writeIp", who);
    if (ip !== "unknown") await rateLimit(getDb(), "writeNet", ip);
  }
}

/** Wrap a route handler so every request is throttled and every error becomes a clean JSON response. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      if (args[0] instanceof Request) await throttle(args[0]);
      const data = await fn(...args);
      if (data instanceof Response) return data;
      return NextResponse.json({ ok: true, data });
    } catch (e) {
      const err = toAppError(e);
      const retry = err.status === 429 ? (err.details as { retryAfterSec?: number } | undefined)?.retryAfterSec : undefined;
      return NextResponse.json(
        { ok: false, error: { code: err.code, message: err.message, details: err.details } },
        { status: err.status, headers: retry ? { "Retry-After": String(retry) } : undefined },
      );
    }
  };
}

export async function body<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw badRequest("Send a JSON body.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Check the form and try again.", z.flattenError(parsed.error).fieldErrors);
  }
  return parsed.data;
}

/** Cron endpoints must send `Authorization: Bearer <CRON_SECRET>` (Vercel Cron does this). */
export function requireCron(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const a = Buffer.from(header), b = Buffer.from(`Bearer ${env().CRON_SECRET}`);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new AppError(401, "UNAUTHORIZED", "Invalid cron secret");
}
