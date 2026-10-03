/**
 * Integration-test harness: a disposable Postgres database with the Supabase shim and
 * every migration applied, the real Express app on an ephemeral port, and HS256
 * access tokens signed like Supabase's (verified locally via SUPABASE_JWT_SECRET).
 *
 * Needs a local Postgres. TEST_PG_URL defaults to postgres://postgres@127.0.0.1:54329/postgres
 */
import crypto from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import pg from "pg";

// Tests build slots with Date#setHours: pin the process to the club timezone on every OS
process.env.TZ = "Africa/Tunis";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const ADMIN_URL = process.env.TEST_PG_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
const JWT_SECRET = "test-jwt-secret-at-least-32-characters-long";

export const dbName = `padel_test_${process.pid}_${Date.now()}`;
const dbUrl = (() => {
  const u = new URL(ADMIN_URL);
  u.pathname = `/${dbName}`;
  return u.toString();
})();

export async function createDatabase() {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${dbName}`);
  await admin.end();

  const c = new pg.Client({ connectionString: dbUrl });
  await c.connect();
  await c.query(readFileSync(resolve(ROOT, "supabase/tests/local-shim.sql"), "utf8"));
  const dir = resolve(ROOT, "supabase/migrations");
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await c.query(readFileSync(resolve(dir, f), "utf8"));
  }
  await c.end();
}

export async function dropDatabase() {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${dbName} with (force)`);
  await admin.end();
}

/**
 * Starts the real app. Must be called after createDatabase (env is read at import).
 * `overrides`: what a test file needs differently (e.g. a local stand-in as SUPABASE_URL).
 */
export async function startApi(overrides: Record<string, string> = {}) {
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: dbUrl,
    SUPABASE_URL: "https://test.supabase.invalid",
    SUPABASE_ANON_KEY: "test-anon",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
    SUPABASE_JWT_SECRET: JWT_SECRET,
    JOBS_ENABLED: "false",
    RATE_LIMIT_WRITES_PER_MINUTE: "0",
    FRONTEND_URL: "https://club.test",
    CLUB_TIMEZONE: "Africa/Tunis",
    LOG_LEVEL: "silent",
    // Never deliver anything for real, even if the developer's .env has provider keys
    RESEND_API_KEY: "",
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
    ...overrides,
  });
  const { default: app } = await import("../src/app");
  const { pool } = await import("@workspace/db");
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  return {
    base,
    pool,
    async close() {
      await new Promise((r) => server.close(r));
      await pool.end();
    },
  };
}

export function sign(sub: string, email: string, ttlSeconds = 3600) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({
    sub,
    email,
    aud: "authenticated",
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  });
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

export type Api = Awaited<ReturnType<typeof startApi>>;

export function client(base: string) {
  return async function call(
    method: string,
    path: string,
    opts: { token?: string; body?: unknown } = {},
  ): Promise<{ status: number; body: any }> {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let body: any = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    return { status: res.status, body };
  };
}

/** Creates an auth user (the DB trigger creates the app user) and returns its token + id. */
export async function signup(pool: pg.Pool, email: string, meta: Record<string, string> = {}) {
  const { rows } = await pool.query(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
    [email, meta],
  );
  const authId: string = rows[0].id;
  const u = await pool.query("select id from public.users where supabase_auth_id = $1", [authId]);
  return { authId, id: u.rows[0].id as number, token: sign(authId, email) };
}

/** Next day's slot on the court grid, club-local time ("HH:MM", days ahead). */
export function slot(hhmm: string, daysAhead = 1) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
