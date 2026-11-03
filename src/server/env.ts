import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_SSL: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  // On Vercel previews APP_URL can be left unset; the branch URL is used instead.
  APP_URL: z
    .string()
    .url()
    .default(
      process.env.VERCEL_BRANCH_URL
        ? `https://${process.env.VERCEL_BRANCH_URL}`
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000",
    ),
  PAYSTACK_SECRET_KEY: z.string().optional().default(""),
  CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 characters"),
  MIN_FUNDING_KOBO: z.coerce.number().int().positive().default(100_000), // ₦1,000
  MIN_WITHDRAWAL_KOBO: z.coerce.number().int().positive().default(200_000), // ₦2,000
});

export type Env = z.infer<typeof schema>;
let cached: Env | null = null;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment configuration. ${msg}`);
    }
    cached = parsed.data;
  }
  return cached;
}
