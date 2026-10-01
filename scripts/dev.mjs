#!/usr/bin/env node
/**
 * Local development runner: `npm run dev` (or `pnpm dev`).
 *
 * - With a configured .env: builds and starts the API server (rebuilt and
 *   restarted on every change) and the Vite site, which proxies /api to it.
 * - Without one (or with `--demo`): starts the site in demo mode, on an
 *   in-memory club, so the UI always runs.
 *
 * Plain Node, no dependencies, works the same on macOS, Linux and Windows.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, watch } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = join(root, "artifacts/padel-club");
const apiDir = join(root, "artifacts/api-server");

const c = (code) => (s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = c("1"),
  dim = c("2"),
  green = c("32"),
  yellow = c("33"),
  cyan = c("36"),
  magenta = c("35");

// ─── Dependencies ────────────────────────────────────────────────────────────
if (!existsSync(join(webDir, "node_modules")) || !existsSync(join(apiDir, "node_modules"))) {
  console.error(
    `\n${yellow("Dependencies are not installed.")} This repo is a pnpm workspace, run once:\n\n` +
      `  ${bold("corepack pnpm install")}   ${dim("(or: npx pnpm install)")}\n`,
  );
  process.exit(1);
}

// ─── .env (same files and precedence as the API server) ─────────────────────
const fileEnv = {};
for (const name of [".env.local", ".env"]) {
  const file = join(root, name);
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i === -1) continue;
    const key = trimmed.slice(0, i).trim();
    const value = trimmed
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/\$\{(\w+)\}/g, (_, k) => process.env[k] ?? fileEnv[k] ?? "");
    fileEnv[key] ??= value;
  }
}
const get = (...keys) => {
  for (const k of keys) {
    const v = process.env[k] || fileEnv[k];
    if (v && !/^your[_-]|your_password|your_anon_key|your_service_role_key/.test(v)) return v;
  }
  return "";
};

const required = {
  VITE_SUPABASE_URL: get("VITE_SUPABASE_URL", "SUPABASE_URL"),
  VITE_SUPABASE_ANON_KEY: get("VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"),
  SUPABASE_SERVICE_ROLE_KEY: get("SUPABASE_SERVICE_ROLE_KEY"),
  DATABASE_URL: get("DATABASE_URL"),
};
const missing = Object.entries(required)
  .filter(([, v]) => !v)
  .map(([k]) => k);
const demo = process.argv.includes("--demo") || missing.length > 0;

const webPort = process.env.WEB_PORT || "5173";
const apiPort = process.env.API_PORT || get("PORT") || "3000";
if (!demo && webPort === apiPort) {
  console.error(yellow(`The site and the API cannot share port ${webPort}. Change PORT in .env.`));
  process.exit(1);
}

// ─── Process management ─────────────────────────────────────────────────────
const children = new Set();
let shuttingDown = false;

function run(label, color, args, opts) {
  const child = spawn(process.execPath, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
  children.add(child);
  const prefix = color(`[${label}]`.padEnd(6));
  for (const stream of [child.stdout, child.stderr]) {
    let buf = "";
    stream.on("data", (chunk) => {
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) process.stdout.write(`${prefix} ${l}\n`);
    });
  }
  child.on("exit", () => children.delete(child));
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill();
  setTimeout(() => process.exit(code), 300);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// ─── Website (Vite) ─────────────────────────────────────────────────────────
const viteBin = join(
  dirname(createRequire(join(webDir, "package.json")).resolve("vite/package.json")),
  "bin/vite.js",
);
const web = run("web", cyan, [viteBin, "--config", "vite.config.ts"], {
  cwd: webDir,
  env: {
    ...process.env,
    PORT: webPort,
    API_PORT: apiPort,
    ...(demo ? { VITE_DEMO: "true" } : {}),
  },
});
web.on("exit", (code) => {
  if (!shuttingDown) {
    console.error(yellow(`\nThe website stopped (exit code ${code}).`));
    shutdown(code ?? 1);
  }
});

// ─── API server (build, start, rebuild on change) ───────────────────────────
if (!demo) {
  let api = null;
  let restarting = false;

  const startApi = () => {
    const build = spawnSync(process.execPath, ["build.mjs"], { cwd: apiDir, encoding: "utf8" });
    if (build.status !== 0) {
      process.stdout.write(
        `${magenta("[api]".padEnd(6))} ${yellow("Build failed, waiting for a fix:")}\n` +
          (build.stderr || build.stdout),
      );
      return;
    }
    api = run("api", magenta, ["--enable-source-maps", "dist/index.mjs"], {
      cwd: apiDir,
      env: { ...process.env, PORT: apiPort },
    });
    api.on("exit", (code, signal) => {
      if (!shuttingDown && !restarting && signal !== "SIGTERM")
        process.stdout.write(
          `${magenta("[api]".padEnd(6))} ${yellow(`stopped (exit code ${code}), it restarts on the next change.`)}\n`,
        );
    });
  };

  let timer;
  const restart = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      restarting = true;
      const prev = api;
      const go = () => {
        restarting = false;
        process.stdout.write(
          `${magenta("[api]".padEnd(6))} ${dim("change detected, restarting…")}\n`,
        );
        startApi();
      };
      if (prev && prev.exitCode === null) {
        prev.once("exit", go);
        prev.kill();
      } else go();
    }, 250);
  };

  // One watcher per directory: recursive fs.watch on Linux misses files that
  // are replaced rather than edited in place (git checkout, some editors).
  const watched = new Set();
  const watchTree = (dir) => {
    if (watched.has(dir) || !existsSync(dir) || !statSync(dir).isDirectory()) return;
    watched.add(dir);
    watch(dir, (event, name) => {
      if (event === "rename" && name) watchTree(join(dir, name.toString()));
      restart();
    }).on("error", () => watched.delete(dir));
    for (const entry of readdirSync(dir, { withFileTypes: true }))
      if (entry.isDirectory()) watchTree(join(dir, entry.name));
  };
  for (const dir of ["artifacts/api-server/src", "lib/db/src", "lib/api-zod/src"])
    watchTree(join(root, dir));
  startApi();
}

// ─── Banner ─────────────────────────────────────────────────────────────────
console.log("");
if (demo) {
  console.log(
    `  ${bold("Smash Padel")} ${yellow("· demo mode")} ${dim("(in-memory club, no backend)")}`,
  );
  console.log(`  ${green("➜")}  Website   ${bold(`http://localhost:${webPort}`)}`);
  if (missing.length && !process.argv.includes("--demo")) {
    console.log(
      `\n  ${yellow("No backend configured.")} To run against Supabase, set in ${bold(".env")}:`,
    );
    for (const k of missing) console.log(`     ${dim("·")} ${k}`);
    if (!existsSync(join(root, ".env")))
      console.log(`  ${dim("Start from .env.example:")} cp .env.example .env`);
  }
} else {
  console.log(`  ${bold("Smash Padel")} ${green("· development")}`);
  console.log(`  ${green("➜")}  Website   ${bold(`http://localhost:${webPort}`)}`);
  console.log(
    `  ${green("➜")}  API       http://localhost:${apiPort}/api ${dim("(proxied by the website)")}`,
  );
}
console.log(`  ${dim("Ctrl+C to stop")}\n`);
