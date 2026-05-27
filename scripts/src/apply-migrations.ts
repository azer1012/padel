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
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    process.env[key] ??= value;
  }
}

loadDotEnv(resolve(process.cwd(), ".env.local"));
loadDotEnv(resolve(process.cwd(), ".env"));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to apply migrations.");
}

const migrationsDir = resolve(process.cwd(), "supabase", "migrations");
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql") && !file.endsWith("_rollback.sql"))
  .sort();

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

try {
  await client.query(`
    create table if not exists public.schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  for (const file of migrationFiles) {
    const version = file.replace(/\.sql$/, "");
    const existing = await client.query("select 1 from public.schema_migrations where version = $1", [version]);

    if (existing.rowCount) {
      console.log(`Skipping ${file}`);
      continue;
    }

    console.log(`Applying ${file}`);
    await client.query("begin");
    try {
      await client.query(readFileSync(resolve(migrationsDir, file), "utf8"));
      await client.query("insert into public.schema_migrations (version) values ($1)", [version]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  await client.end();
}

