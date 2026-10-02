/**
 * Database invariant tests on a throwaway local database:
 * Supabase shim + every migration + supabase/tests/db-invariants.sql.
 *
 *   TEST_PG_URL=postgres://postgres@127.0.0.1:54329/postgres pnpm --filter @workspace/scripts run db:test
 *
 * Uses `psql` when it is on PATH, otherwise the pg driver.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const root = resolve(import.meta.dirname, "..", "..");
const adminUrl = process.env.TEST_PG_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
const name = `padel_invariants_${process.pid}`;
const url = new URL(adminUrl);
url.pathname = `/${name}`;

const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
await admin.query(`create database ${name}`);
let failed: boolean | undefined;
try {
  const c = new pg.Client({ connectionString: url.toString() });
  await c.connect();
  await c.query(readFileSync(resolve(root, "supabase/tests/local-shim.sql"), "utf8"));
  const dir = resolve(root, "supabase/migrations");
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await c.query(readFileSync(resolve(dir, f), "utf8"));
    console.log(`  migrated ${f}`);
  }
  await c.end();
  const file = resolve(root, "supabase/tests/db-invariants.sql");
  const run = spawnSync("psql", [url.toString(), "-X", "-f", file], { stdio: "inherit" });
  if (run.error) {
    // No psql on this machine: run the same file through the driver (it stops at the
    // first error, like ON_ERROR_STOP; the two psql meta-commands are dropped).
    const t = new pg.Client({ connectionString: url.toString() });
    t.on("notice", (n) => console.log(`NOTICE:  ${n.message}`));
    await t.connect();
    try {
      await t.query(
        readFileSync(file, "utf8")
          .split(/\r?\n/)
          .filter((l) => !l.startsWith("\\"))
          .join("\n"),
      );
      failed = false;
    } catch (err) {
      console.error(`ERROR:  ${(err as Error).message}`);
      failed = true;
    } finally {
      await t.end();
    }
  } else failed = run.status !== 0;
} finally {
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.end();
}
process.exit(failed === false ? 0 : 1);
