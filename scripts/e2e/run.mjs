#!/usr/bin/env node
/**
 * Runs the browser tests against a throw-away stack, in one command:
 *
 *   node scripts/e2e/run.mjs                    every *.e2e.mjs file
 *   node scripts/e2e/run.mjs booking            only the files whose name contains "booking"
 *   node scripts/e2e/run.mjs --serve            start the stack and leave it running
 *
 * It creates a database on the local test Postgres (TEST_PG_URL, never the one of
 * .env), applies the Supabase shim, every migration and the seed, then starts the
 * Supabase Auth stand-in, the API and the website on their own ports. Each test
 * file gets a fresh database. Everything is stopped and dropped at the end.
 *
 * Needs `playwright` resolvable (see docs/TESTING.md).
 */
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync, readdirSync, readFileSync } from "node:fs";
import net from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { startAuthStub } from "./auth-stub.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const ADMIN_URL = process.env.TEST_PG_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
const PORTS = { api: 3101, web: 5199, auth: 54400 };
const JWT_SECRET = "e2e-jwt-secret-that-is-long-enough-123456";
const PASSWORD = "Padel-e2e-2026";
const LOGS = resolve(process.env.E2E_LOG_DIR ?? join(root, "e2e-screenshots"));
mkdirSync(LOGS, { recursive: true });

const args = process.argv.slice(2);
const serve = args.includes("--serve");
const filters = args.filter((a) => !a.startsWith("--"));
const files = readdirSync(here)
  .filter((f) => f.endsWith(".e2e.mjs"))
  .filter((f) => !filters.length || filters.some((x) => f.includes(x)))
  .sort();

const dbName = `padel_e2e_${process.pid}`;
const dbUrl = (() => {
  const u = new URL(ADMIN_URL);
  u.pathname = `/${dbName}`;
  return u.toString();
})();

async function admin(sql) {
  const c = new pg.Client({ connectionString: ADMIN_URL });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

/**
 * Suites that need the API in another mode. The public demo (DEMO_MODE) starts from
 * an empty base and creates its own club: no test seed for it.
 */
const SUITES = {
  "demo.e2e.mjs": {
    seed: false,
    env: { DEMO_MODE: "true", DEMO_PASSWORD: "Demo-padel-2026", JOBS_ENABLED: "false" },
  },
  // Online payment through the stand-in gateway (nothing leaves the machine)
  "payments.e2e.mjs": { env: { PAYMENT_PROVIDER: "test" } },
};

async function createDatabase({ seed = true } = {}) {
  await admin(`drop database if exists ${dbName} with (force)`);
  await admin(`create database ${dbName}`);
  const c = new pg.Client({ connectionString: dbUrl });
  await c.connect();
  try {
    await c.query(readFileSync(join(root, "supabase/tests/local-shim.sql"), "utf8"));
    const dir = join(root, "supabase/migrations");
    for (const f of readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await c.query(readFileSync(join(dir, f), "utf8"));
    if (seed) await c.query(readFileSync(join(here, "seed.sql"), "utf8"));
  } finally {
    await c.end();
  }
}

function waitForPort(port, name, child) {
  return new Promise((ok, fail) => {
    const deadline = Date.now() + 60_000;
    const attempt = () => {
      if (child?.exitCode != null) return fail(new Error(`${name} stopped (see ${LOGS})`));
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => (socket.destroy(), ok()));
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) fail(new Error(`${name} did not open port ${port}`));
        else setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

const children = [];
function start(name, cwd, argv, env) {
  const child = spawn(process.execPath, argv, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = createWriteStream(join(LOGS, `${name}.log`));
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  children.push(child);
  return child;
}
function stop(child) {
  if (child.exitCode != null) return;
  if (process.platform === "win32")
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

const authUrl = `http://127.0.0.1:${PORTS.auth}`;
const apiEnv = {
  NODE_ENV: "test",
  PORT: String(PORTS.api),
  DATABASE_URL: dbUrl,
  SUPABASE_URL: authUrl,
  SUPABASE_ANON_KEY: "e2e-anon",
  SUPABASE_SERVICE_ROLE_KEY: "e2e-service-role",
  SUPABASE_JWT_SECRET: JWT_SECRET,
  JOBS_ENABLED: "false",
  CRON_SECRET: "e2e-cron-secret",
  RATE_LIMIT_WRITES_PER_MINUTE: "0",
  FRONTEND_URL: `http://127.0.0.1:${PORTS.web}`,
  CORS_ORIGIN: `http://127.0.0.1:${PORTS.web}`,
  CLUB_TIMEZONE: "Africa/Tunis",
  // Never deliver anything for real, even if the developer's .env has provider keys
  RESEND_API_KEY: "",
  VAPID_PUBLIC_KEY: "",
  VAPID_PRIVATE_KEY: "",
};

let stub;
let api;
async function startBackend(file) {
  const suite = SUITES[file] ?? {};
  await createDatabase({ seed: suite.seed !== false });
  stub = await startAuthStub({
    port: PORTS.auth,
    databaseUrl: dbUrl,
    jwtSecret: JWT_SECRET,
    defaultPassword: PASSWORD,
  });
  api = start("api", join(root, "artifacts/api-server"), ["dist/index.mjs"], {
    ...apiEnv,
    ...suite.env,
  });
  await waitForPort(PORTS.api, "API", api);
}
async function stopBackend() {
  if (api) stop(api);
  await stub?.close();
  await admin(`drop database if exists ${dbName} with (force)`);
}

let failed = 0;
try {
  const build = spawnSync(process.execPath, ["build.mjs"], {
    cwd: join(root, "artifacts/api-server"),
    stdio: "inherit",
  });
  if (build.status !== 0) throw new Error("API build failed");

  const web = start(
    "web",
    join(root, "artifacts/padel-club"),
    ["node_modules/vite/bin/vite.js", "--config", "vite.config.ts", "--host", "127.0.0.1"],
    {
      PORT: String(PORTS.web),
      API_PORT: String(PORTS.api),
      VITE_SUPABASE_URL: authUrl,
      VITE_SUPABASE_ANON_KEY: "e2e-anon",
      VITE_AUTH_GOOGLE_ENABLED: "false",
      VITE_API_URL: "",
    },
  );
  await waitForPort(PORTS.web, "website", web);

  if (serve) {
    await startBackend();
    console.log(
      `\nStack ready: site http://127.0.0.1:${PORTS.web}  API http://127.0.0.1:${PORTS.api}/api\n` +
        `Database ${dbName}. Seeded members sign in with the password ${PASSWORD}. Ctrl+C to stop.\n`,
    );
    await new Promise((done) => process.once("SIGINT", done));
  } else {
    for (const file of files) {
      console.log(`\n━━ ${file}`);
      await startBackend(file);
      // Not spawnSync: the Auth stand-in lives in this process and must keep answering
      const test = spawn(process.execPath, [join(here, file)], {
        stdio: "inherit",
        env: {
          ...process.env,
          WEB_BASE: `http://127.0.0.1:${PORTS.web}`,
          API_BASE: `http://127.0.0.1:${PORTS.api}/api`,
          AUTH_BASE: authUrl,
          DATABASE_URL: dbUrl,
          SUPABASE_JWT_SECRET: JWT_SECRET,
          E2E_PASSWORD: PASSWORD,
          E2E_CRON_SECRET: apiEnv.CRON_SECRET,
          SHOTS_DIR: process.env.SHOTS_DIR ?? LOGS,
        },
      });
      const status = await new Promise((done) => test.once("exit", done));
      if (status !== 0) failed++;
      await stopBackend();
      api = stub = undefined;
    }
  }
} catch (err) {
  console.error(`\n${err?.message ?? err}`);
  failed++;
} finally {
  for (const child of children) stop(child);
  await stub?.close().catch(() => {});
  await admin(`drop database if exists ${dbName} with (force)`).catch(() => {});
}

if (!serve) console.log(failed ? `\n${failed} file(s) failed` : "\nAll browser tests passed");
process.exit(failed ? 1 : 0);
