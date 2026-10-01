/**
 * Applies supabase/migrations/*.sql in order, each in its own transaction, and records
 * them in supabase_migrations.schema_migrations: the same history table the Supabase
 * CLI uses, so `supabase migration list` / `supabase db push` agree with this script.
 *
 *   DATABASE_URL=postgresql://... pnpm --filter @workspace/scripts run db:migrate
 *   (add --dry-run to only list what would run)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

function loadDotEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    process.env[key] ??= value;
  }
}

const root = resolve(import.meta.dirname, "..", "..");
loadDotEnv(resolve(root, ".env.local"));
loadDotEnv(resolve(root, ".env"));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to apply migrations.");
const dryRun = process.argv.includes("--dry-run");

const migrationsDir = resolve(root, "supabase", "migrations");
const files = readdirSync(migrationsDir)
  .filter((f) => /^\d{14}_.+\.sql$/.test(f))
  .sort();

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(databaseUrl);
const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: local ? undefined : { rejectUnauthorized: false },
});
await client.connect();

try {
  await client.query(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[],
      name text
    );
  `);
  const { rows } = await client.query<{ version: string }>(
    "select version from supabase_migrations.schema_migrations",
  );
  const applied = new Set(rows.map((r) => r.version));

  for (const file of files) {
    const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
    const name = rest.join("_");
    if (applied.has(version)) {
      console.log(`  skip   ${file}`);
      continue;
    }
    if (dryRun) {
      console.log(`  would  ${file}`);
      continue;
    }
    const sql = readFileSync(resolve(migrationsDir, file), "utf8");
    console.log(`  apply  ${file}`);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(
        "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)",
        [version, name, [sql]],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  await client.end();
}
