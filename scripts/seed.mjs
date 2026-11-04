// Creates the first admin and an example social-growth provider.
// Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run db:seed
import pg from "pg";
import bcrypt from "bcryptjs";

const { DATABASE_URL, DATABASE_SSL, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!DATABASE_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Set DATABASE_URL, ADMIN_EMAIL and ADMIN_PASSWORD.");
  process.exit(1);
}
const client = new pg.Client({ connectionString: DATABASE_URL, ssl: DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
await client.connect();
await client.query("BEGIN");
const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
const { rows } = await client.query(
  `INSERT INTO users (email, password_hash, name, role, email_verified_at) VALUES ($1, $2, 'Admin', 'admin', now())
   ON CONFLICT (email) DO UPDATE SET role = 'admin', email_verified_at = coalesce(users.email_verified_at, now()) RETURNING id`,
  [ADMIN_EMAIL.toLowerCase(), hash],
);
await client.query("INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [rows[0].id]);
const exists = await client.query("SELECT 1 FROM smm_providers LIMIT 1");
if (exists.rowCount === 0) {
  // Edit api_url, currency, fx and markup to match your provider, then run a sync from /api/admin/providers/:id/sync.
  await client.query(
    `INSERT INTO smm_providers (name, api_url, api_key_env, currency, fx_kobo_per_unit, markup_bps)
     VALUES ('Provider 1', 'https://example-panel.com/api/v2', 'SMM_PROVIDER_1_KEY', 'NGN', 100, 3000)`,
  );
}
await client.query("COMMIT");
console.log(`Admin ready: ${ADMIN_EMAIL}`);
await client.end();
