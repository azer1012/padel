import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// Timestamps are stored as UTC in `timestamp` columns. SQL `now()` (column defaults,
// reports) only agrees with that when the session runs in UTC: never rely on the
// server's own timezone setting.
const config = {
  connectionString: process.env.DATABASE_URL,
  onConnect: async (client: pg.PoolClient) => {
    await client.query("set time zone 'UTC'");
  },
};
export const pool = new Pool(config);
export const db = drizzle(pool, { schema });

export type Db = typeof db;
/** The handle a `db.transaction` callback receives. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Anything a query can run on: the pool or an open transaction. */
export type Queryable = Db | Tx;

export * from "./schema";
