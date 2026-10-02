/**
 * Shared helpers of the browser tests: seeded members, signed access tokens, a
 * direct API client, browser contexts and the step runner.
 */
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import pg from "pg";

const require = createRequire(import.meta.url);
export const { chromium, webkit } = require("playwright");

export const WEB = process.env.WEB_BASE ?? "http://127.0.0.1:5199";
export const API = process.env.API_BASE ?? "http://127.0.0.1:3101/api";
export const AUTH = process.env.AUTH_BASE ?? "http://127.0.0.1:54400";
export const PASSWORD = process.env.E2E_PASSWORD ?? "Padel-e2e-2026";
export const CRON_SECRET = process.env.E2E_CRON_SECRET ?? "e2e-cron-secret";
const SECRET = process.env.SUPABASE_JWT_SECRET ?? "e2e-jwt-secret-that-is-long-enough-123456";
const SHOTS = process.env.SHOTS_DIR ?? "e2e-screenshots";
mkdirSync(SHOTS, { recursive: true });

/** Members of scripts/e2e/seed.sql (ids 1 to 5 in public.users, in this order). */
export const USERS = {
  yasmine: {
    n: 1,
    id: "11111111-1111-1111-1111-111111111111",
    email: "yasmine@test.tn",
    first: "Yasmine",
  },
  karim: {
    n: 2,
    id: "22222222-2222-2222-2222-222222222222",
    email: "karim@test.tn",
    first: "Karim",
  },
  ines: { n: 3, id: "33333333-3333-3333-3333-333333333333", email: "ines@test.tn", first: "Ines" },
  admin: {
    n: 4,
    id: "44444444-4444-4444-4444-444444444444",
    email: "admin@club.tn",
    first: "Club",
  },
  dalia: {
    n: 5,
    id: "55555555-5555-5555-5555-555555555555",
    email: "dalia@test.tn",
    first: "Dalia",
  },
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

/** An access token like Supabase's. `ttl` in seconds (negative = already expired). */
export function token(u, { ttl = 6 * 3600, secret = SECRET, claims = {} } = {}) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const body = b64({
    sub: u.id,
    email: u.email,
    aud: "authenticated",
    role: "authenticated",
    exp,
    ...claims,
  });
  const sig = crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return { jwt: `${head}.${body}.${sig}`, exp };
}

/** Calls the API as a member (`u` null = visitor, a string = that raw bearer value). */
export async function api(u, method, path, body) {
  const bearer = typeof u === "string" ? u : u ? token(u).jwt : null;
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(bearer !== null ? { authorization: `Bearer ${bearer}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json, headers: res.headers };
}

/** Reads the test database directly, for what the API has no reason to expose. */
export async function sql(text, params = []) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(text, params)).rows;
  } finally {
    await client.end();
  }
}

/** Controls of the Supabase Auth stand-in (state of an account, last e-mail link). */
export const auth = {
  account: (body) =>
    fetch(`${AUTH}/__test/account`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  config: (body) =>
    fetch(`${AUTH}/__test/config`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  /** Link of the last e-mail to this address ("legacy" = the older ConfirmationURL form). */
  async mail(email, template = "hash") {
    const res = await fetch(
      `${AUTH}/__test/mail?email=${encodeURIComponent(email)}&template=${template}`,
    );
    return (await res.json()).link;
  },
};

/** Club-local "HH:MM" of a day `daysAhead` from today, as the instant the API expects. */
export function slot(hhmm, daysAhead = 1) {
  const day = clubDay(daysAhead);
  // Africa/Tunis is UTC+1 all year (no daylight saving)
  return new Date(`${day}T${hhmm}:00+01:00`).toISOString();
}
/** "YYYY-MM-DD" in the club's time zone, `daysAhead` from today. */
export function clubDay(daysAhead = 0) {
  return new Date(Date.now() + daysAhead * 86400e3).toLocaleDateString("en-CA", {
    timeZone: "Africa/Tunis",
  });
}

export const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
export const equal = (actual, expected, what) =>
  assert(
    actual === expected,
    `${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );

const results = [];
/** Pages still open, so a failed step can show what each member was looking at. */
const pages = new Set();
export async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log(`  ✔ ${name}`);
  } catch (e) {
    results.push({ name, ok: false });
    const lines = String(e?.message ?? e).split("\n");
    console.log(`  ✘ ${name}\n      ${lines.slice(0, 4).join("\n      ")}`);
    let i = 0;
    for (const page of pages)
      if (!page.isClosed())
        await page
          .screenshot({ path: join(SHOTS, `failed-step-${results.length}-${++i}.png`) })
          .catch(() => {});
  }
}
export const section = (title) => console.log(`\n${title}`);

let browser;
export async function launch(engine = chromium) {
  browser = await engine.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  return browser;
}

/**
 * A browser context, signed in as `u` when given (session written the way
 * supabase-js stores it). Console errors, page errors and failed API calls are
 * collected on `page.problems`.
 */
export async function as(u, viewport = { width: 1366, height: 900 }, options = {}) {
  const ctx = await browser.newContext({
    viewport,
    locale: "fr-FR",
    timezoneId: "Africa/Tunis",
    ...options,
  });
  if (u) {
    const { jwt, exp } = token(u);
    const session = {
      access_token: jwt,
      token_type: "bearer",
      expires_in: 6 * 3600,
      expires_at: exp,
      refresh_token: "e2e-refresh",
      user: {
        id: u.id,
        aud: "authenticated",
        role: "authenticated",
        email: u.email,
        app_metadata: { provider: "email" },
        user_metadata: { first_name: u.first },
        created_at: new Date().toISOString(),
      },
    };
    await ctx.addInitScript((s) => {
      if (!sessionStorage.getItem("e2e-session-set")) {
        localStorage.setItem("padel-club-auth", JSON.stringify(s));
        sessionStorage.setItem("e2e-session-set", "1");
      }
      localStorage.setItem("padel-lang", "fr");
    }, session);
  } else {
    await ctx.addInitScript(() => localStorage.setItem("padel-lang", "fr"));
  }
  const page = await ctx.newPage();
  watch(page);
  pages.add(page);
  return { ctx, page };
}

/** Collects what a member would never see but a tester must: errors behind the page. */
export function watch(page) {
  page.problems = [];
  page.on("pageerror", (e) => page.problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") page.problems.push(`console: ${m.text()}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 500) page.problems.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return page;
}

export const shot = (page, name) =>
  page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false });

const weekday = (daysAhead) =>
  new Date(Date.now() + daysAhead * 86400e3).toLocaleDateString("fr-FR", {
    weekday: "long",
    timeZone: "Africa/Tunis",
  });

/** Shows a day of the planning, `daysAhead` from today. */
export async function pickDay(page, daysAhead = 1) {
  await page
    .getByRole("button", { name: new RegExp(`^${weekday(daysAhead)}`, "i") })
    .first()
    .click();
}

/** The planning cell of a court at a club time (its accessible name says its state). */
export const cell = (page, court, time) =>
  page.getByRole("button", { name: new RegExp(`^${court} ${time}:`) });

/** Opens the planning cell of a court at a club time, `daysAhead` from today. */
export async function openSlot(page, court, time, daysAhead = 1) {
  await pickDay(page, daysAhead);
  await cell(page, court, time).waitFor({ timeout: 10000 });
  await cell(page, court, time).click();
  return page.getByRole("dialog");
}

/** The card of a court on "Mes réservations". */
export const bookingCard = (page, court) =>
  page
    .getByText(court, { exact: true })
    .locator("xpath=ancestor::*[.//button[contains(., 'Calendrier')]][1]");

/** How far the document is wider than the screen, in pixels (0 = no sideways scroll). */
export const overflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

export async function finish() {
  await browser?.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  process.exit(failed.length ? 1 : 0);
}
