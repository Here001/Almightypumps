import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { env } from "../env";

export type Db = NodePgDatabase<typeof schema>;
/** A transaction handle has the same query API as the database. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

const globalForDb = globalThis as unknown as { __apPool?: Pool; __apDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__apDb) {
    const pool =
      globalForDb.__apPool ??
      new Pool({
        connectionString: env().DATABASE_URL,
        max: 10,
        ssl: env().DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
      });
    globalForDb.__apPool = pool;
    globalForDb.__apDb = drizzle(pool, { schema });
  }
  return globalForDb.__apDb;
}

export { schema };
