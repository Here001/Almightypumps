// Applies drizzle/*.sql files in order, once each. Usage: npm run db:migrate
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("Set DATABASE_URL first (copy .env.example to .env)."); process.exit(1); }
const ssl = process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined;
const client = new pg.Client({ connectionString: url, ssl });
await client.connect();
await client.query("CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
const done = new Set((await client.query("SELECT name FROM _migrations")).rows.map((r) => r.name));
const dir = join(process.cwd(), "drizzle");
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(file)) continue;
  console.log(`Applying ${file}...`);
  await client.query("BEGIN");
  try {
    await client.query(readFileSync(join(dir, file), "utf8"));
    await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(`Failed on ${file}:`, e.message);
    process.exit(1);
  }
}
console.log("Database is up to date.");
await client.end();
