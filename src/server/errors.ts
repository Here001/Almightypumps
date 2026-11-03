import { MoneyError } from "@/core/money";
import { LedgerError } from "@/core/ledger";
import { EscrowError } from "@/core/escrow";

/** An error whose message is safe to show to the person using the app. */
export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what = "That item") => new AppError(404, "NOT_FOUND", `${what} wasn't found.`);
export const forbidden = (msg = "You don't have access to this.") => new AppError(403, "FORBIDDEN", msg);
export const badRequest = (msg: string, details?: unknown) => new AppError(400, "BAD_REQUEST", msg, details);
export const unauthorized = () => new AppError(401, "UNAUTHORIZED", "Please log in to continue.");

/** Convert domain errors from the pure core into AppErrors. */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof LedgerError) return new AppError(e.code === "INSUFFICIENT_FUNDS" ? 402 : 409, e.code, e.message);
  if (e instanceof EscrowError) return new AppError(409, e.code, e.message);
  if (e instanceof MoneyError) return new AppError(400, e.code, e.message);
  console.error(e);
  return new AppError(500, "INTERNAL", "Something went wrong on our side. Please try again in a moment.");
}
