import { NextResponse } from "next/server";
import type { ZodType, ZodTypeDef } from "zod";
import { env } from "./env";
import { AppError, badRequest, toAppError } from "./errors";

/** Wrap a route handler so every error becomes a clean JSON response. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      const data = await fn(...args);
      if (data instanceof Response) return data;
      return NextResponse.json({ ok: true, data });
    } catch (e) {
      const err = toAppError(e);
      return NextResponse.json({ ok: false, error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
    }
  };
}

export async function body<T>(req: Request, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw badRequest("Send a JSON body.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Check the form and try again.", parsed.error.flatten().fieldErrors);
  }
  return parsed.data;
}

/** Cron endpoints must send `Authorization: Bearer <CRON_SECRET>` (Vercel Cron does this). */
export function requireCron(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  if (header !== `Bearer ${env().CRON_SECRET}`) throw new AppError(401, "UNAUTHORIZED", "Invalid cron secret");
}
