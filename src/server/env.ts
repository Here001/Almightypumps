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
  FLUTTERWAVE_SECRET_KEY: z.string().optional().default(""),
  // The "secret hash" set in Flutterwave > Settings > Webhooks.
  FLUTTERWAVE_WEBHOOK_HASH: z.string().optional().default(""),
  FLUTTERWAVE_BASE_URL: z.string().url().optional().default("https://api.flutterwave.com/v3"), // local tests only
  // TextVerified ("Get Verification Code"): API V2 key + the account's login email.
  TEXTVERIFIED_API_KEY: z.string().optional().default(""),
  TEXTVERIFIED_API_USERNAME: z.string().optional().default(""),
  TEXTVERIFIED_BASE_URL: z.string().url().optional().default("https://www.textverified.com"),
  // Reloadly (gift cards, airtime/data). RELOADLY_ENV = "sandbox" | "live"; empty = live on production, sandbox
  // elsewhere, and the other one is tried automatically if the keys don't work there.
  RELOADLY_CLIENT_ID: z.string().optional().default(""),
  RELOADLY_CLIENT_SECRET: z.string().optional().default(""),
  RELOADLY_ENV: z.enum(["", "sandbox", "live"]).optional().default(""),
  // Local tests only: send every Reloadly call (auth, gift cards, top-ups) to one mock server.
  RELOADLY_MOCK_URL: z.string().optional().default(""),
  // eSIM Access (travel data eSIMs).
  ESIMACCESS_ACCESS_CODE: z.string().optional().default(""),
  ESIMACCESS_SECRET_KEY: z.string().optional().default(""),
  ESIMACCESS_BASE_URL: z.string().url().optional().default("https://api.esimaccess.com"),
  // Resend (sends the 6-digit sign-up / new-device codes). Codes are off until RESEND_API_KEY is set.
  RESEND_API_KEY: z.string().optional().default(""),
  EMAIL_FROM: z.string().optional().default("Almighty Pumps <no-reply@almightypumps.com>"),
  RESEND_BASE_URL: z.string().url().optional().default("https://api.resend.com"), // local tests only
  // Vercel Blob file storage (ad photos). Set automatically by Vercel when the store is linked; empty = photos stay in the database.
  BLOB_READ_WRITE_TOKEN: z.string().optional().default(""),
  // Terminal Africa (T-Ship) for "Send a Package". Test keys use the sandbox automatically; TERMINAL_AFRICA_BASE_URL overrides (mocks).
  TERMINAL_AFRICA_SECRET_KEY: z.string().optional().default(""),
  TERMINAL_AFRICA_BASE_URL: z.string().optional().default(""),
  // WhatsApp agent: Meta WhatsApp Cloud API (Meta for Developers > your app > WhatsApp > API setup) + Claude (Anthropic).
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(""),     // permanent System User token
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(""),  // the business number's "Phone number ID"
  WHATSAPP_APP_SECRET: z.string().optional().default(""),       // App settings > Basic > App secret (checks webhook signatures)
  WHATSAPP_GRAPH_URL: z.string().optional().default(""),        // local tests only (mock)
  ANTHROPIC_API_KEY: z.string().optional().default(""),
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
