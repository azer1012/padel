/**
 * End-to-end journey in a real browser against the real API and database.
 *
 * Auth: Supabase Auth itself (signup e-mails, Google) can't run offline, so each
 * browser starts with a session whose access token is signed with the API's
 * SUPABASE_JWT_SECRET. Everything after sign-in is the production code path.
 *
 * Needs: API on API_BASE, web app on WEB_BASE (proxying /api), users from the
 * E2E seed, `playwright` resolvable (global install is fine: NODE_PATH=$(npm root -g)).
 *   node scripts/e2e/booking.e2e.mjs
 */
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const WEB = process.env.WEB_BASE ?? "http://127.0.0.1:5199";
const API = process.env.API_BASE ?? "http://127.0.0.1:3101/api";
const SECRET = process.env.SUPABASE_JWT_SECRET ?? "e2e-jwt-secret-that-is-long-enough-123456";
const SHOTS = process.env.SHOTS_DIR ?? "e2e-screenshots";
mkdirSync(SHOTS, { recursive: true });

const USERS = {
  yasmine: {
    id: "11111111-1111-1111-1111-111111111111",
    email: "yasmine@test.tn",
    first: "Yasmine",
  },
  karim: { id: "22222222-2222-2222-2222-222222222222", email: "karim@test.tn", first: "Karim" },
  ines: { id: "33333333-3333-3333-3333-333333333333", email: "ines@test.tn", first: "Ines" },
  admin: { id: "44444444-4444-4444-4444-444444444444", email: "admin@club.tn", first: "Club" },
};

function token(u) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "HS256", typ: "JWT" });
  const exp = Math.floor(Date.now() / 1000) + 6 * 3600;
  const body = b64({ sub: u.id, email: u.email, aud: "authenticated", role: "authenticated", exp });
  const sig = crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return { jwt: `${head}.${body}.${sig}`, exp };
}

async function api(u, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${token(u).jwt}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const results = [];
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log(`  ✔ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: String(e?.message ?? e).split("\n")[0] });
    console.log(
      `  ✘ ${name}\n      ${String(e?.message ?? e)
        .split("\n")
        .slice(0, 3)
        .join("\n      ")}`,
    );
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function as(u, viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport, locale: "fr-FR", timezoneId: "Africa/Tunis" });
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
      localStorage.setItem("padel-club-auth", JSON.stringify(s));
      localStorage.setItem("padel-lang", "fr");
    }, session);
  }
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`      [pageerror] ${e.message}`));
  return { ctx, page };
}
const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false });

const tomorrow = new Date(Date.now() + 86400e3);
const dayLabel = String(tomorrow.getDate());
/** Clicks the calendar cell of a court at a time on tomorrow's planning. */
async function openSlot(page, court, time) {
  await page
    .getByRole("button", {
      name: new RegExp(`^${tomorrow.toLocaleDateString("fr-FR", { weekday: "long" })}`, "i"),
    })
    .first()
    .click();
  const cell = page.getByRole("button", { name: new RegExp(`^${court} ${time}:`) });
  await cell.waitFor({ timeout: 10000 });
  await cell.click();
}

let inviteUrl = "";
let ownSpotId = 0;

console.log("\nPlayer journey");
const y = await as(USERS.yasmine);

await step("admin credits 12 tokens to Yasmine (cash paid at the desk)", async () => {
  const r = await api(USERS.admin, "POST", "/tokens/admin/adjust", {
    userId: 1,
    type: "credit",
    amount: 12,
    description: "Recharge à l'accueil",
    idempotencyKey: `e2e-${Date.now()}`,
  });
  assert(r.status === 200, `adjust → ${r.status} ${JSON.stringify(r.body)}`);
});

await step("dashboard loads with balance", async () => {
  await y.page.goto(`${WEB}/dashboard`);
  await y.page.getByText("12").first().waitFor({ timeout: 15000 });
  await shot(y.page, "01-dashboard");
});

await step("planning shows courts as columns and 90-min rows", async () => {
  await y.page.goto(`${WEB}/terrains`);
  await y.page.getByRole("columnheader", { name: /Court Central/ }).waitFor({ timeout: 15000 });
  const headers = await y.page.getByRole("columnheader").allInnerTexts();
  assert(
    headers.filter((h) => /Court/.test(h)).length === 4,
    `court columns: ${headers.join("|")}`,
  );
  const rows = await y.page.getByRole("rowheader").allInnerTexts();
  assert(
    rows.includes("08:00") && rows.includes("21:30") && rows.length === 10,
    `rows: ${rows.join(",")}`,
  );
  await shot(y.page, "02-planning-desktop");
});

await step("book a full court (4 tokens) and get an invite link", async () => {
  await openSlot(y.page, "Court Central", "18:30");
  const dialog = y.page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /Terrain complet/ }).waitFor();
  await shot(y.page, "03-book-dialog");
  await dialog.getByRole("button", { name: "Confirmer" }).click();
  await dialog.getByText("C'est réservé !").waitFor({ timeout: 10000 });
  const code = dialog.locator("code");
  await code.waitFor({ timeout: 10000 });
  inviteUrl = (await code.innerText()).trim();
  assert(/\/join\/[A-Za-z0-9_-]{16,}/.test(inviteUrl), `invite url: ${inviteUrl}`);
  await dialog.getByRole("button", { name: "QR" }).click();
  await dialog.getByRole("img", { name: "QR code" }).locator("svg").waitFor({ timeout: 10000 });
  await shot(y.page, "04-booked-invite-qr");
  const me = await api(USERS.yasmine, "GET", "/users/me");
  assert(me.body.tokenBalance === 8, `balance after full court = ${me.body.tokenBalance}`);
});

await step("invited friend joins the full court for free", async () => {
  const k = await as(USERS.karim, { width: 390, height: 844 });
  await k.page.goto(inviteUrl.replace(/^https?:\/\/[^/]+/, WEB));
  await k.page.getByText(/votre place est offerte/).waitFor({ timeout: 15000 });
  await shot(k.page, "05-invite-landing-mobile");
  await k.page.getByRole("button", { name: /Rejoindre le match/ }).click();
  await k.page.waitForURL(/\/reservations/, { timeout: 15000 });
  await k.page.getByText("Invité").first().waitFor({ timeout: 10000 });
  await shot(k.page, "06-friend-reservations-mobile");
  const me = await api(USERS.karim, "GET", "/users/me");
  assert(me.body.tokenBalance === 0, `friend paid ${me.body.tokenBalance}`);
  await k.ctx.close();
});

await step("book only my spot (1 token) as an open match", async () => {
  await y.page.goto(`${WEB}/terrains`);
  await openSlot(y.page, "Court 3", "20:00");
  const dialog = y.page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /Ma place/ }).click();
  await dialog.getByRole("button", { name: "Confirmer" }).click();
  await dialog.getByText("C'est réservé !").waitFor({ timeout: 10000 });
  await dialog.getByRole("button", { name: "Terminé" }).click();
  const up = await api(USERS.yasmine, "GET", "/reservations/upcoming");
  const own = up.body.find((r) => r.bookingMode === "own_spot");
  ownSpotId = own.id;
  const me = await api(USERS.yasmine, "GET", "/users/me");
  assert(me.body.tokenBalance === 7, `balance = ${me.body.tokenBalance}`);
});

await step("another player takes a spot and pays cash at the club (2/4)", async () => {
  const i = await as(USERS.ines, { width: 390, height: 844 });
  await i.page.goto(`${WEB}/terrains`);
  await openSlot(i.page, "Court 3", "20:00");
  const dialog = i.page.getByRole("dialog");
  await dialog.getByText(/3 place\(s\) libre\(s\)/).waitFor({ timeout: 10000 });
  await shot(i.page, "07-open-match-mobile");
  await dialog.getByRole("button", { name: /Payer au club/ }).click();
  await i.page.getByText("Vous êtes dans le match !").first().waitFor({ timeout: 10000 });
  await shot(i.page, "08-planning-mobile-after-join");
  await i.ctx.close();
});

await step("my reservations: both matches, payment states, invite & cancel actions", async () => {
  await y.page.goto(`${WEB}/reservations`);
  await y.page.getByText("Court Central").first().waitFor({ timeout: 15000 });
  await y.page.getByText("Payé · token").first().waitFor();
  const cancelButtons = await y.page.getByRole("button", { name: "Annuler" }).count();
  assert(cancelButtons >= 2, `cancel buttons ${cancelButtons}`);
  await shot(y.page, "09-my-reservations");
});

await step("a slot taken meanwhile is refused cleanly (no double booking)", async () => {
  // Admin books Court 2 at 11:00 behind Yasmine's back while her dialog is open
  await y.page.goto(`${WEB}/terrains`);
  await openSlot(y.page, "Court 2", "11:00");
  const start = new Date(tomorrow);
  start.setHours(11, 0, 0, 0);
  const r = await api(USERS.admin, "POST", "/reservations", {
    terrainId: 2,
    startTime: start.toISOString(),
    bookingMode: "full_court",
    guestName: "Walk-in",
    bookingType: "manual",
  });
  assert(r.status === 201, `admin booking ${r.status}`);
  const dialog = y.page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Confirmer" }).click();
  await y.page.getByText("Ce créneau vient d'être réservé").first().waitFor({ timeout: 10000 });
  await y.page.getByRole("dialog").waitFor({ state: "hidden", timeout: 10000 });
  const me = await api(USERS.yasmine, "GET", "/users/me");
  assert(me.body.tokenBalance === 7, `balance changed to ${me.body.tokenBalance}`);
  await shot(y.page, "09b-slot-taken");
});

console.log("\nAdmin journey");
const a = await as(USERS.admin);

await step("admin dashboard", async () => {
  await a.page.goto(`${WEB}/admin`);
  await a.page.getByRole("heading").first().waitFor({ timeout: 15000 });
  await a.page.waitForTimeout(1500);
  await shot(a.page, "10-admin-dashboard");
});

await step("admin marks the cash spot as paid from the planning", async () => {
  await a.page.goto(`${WEB}/admin/reservations`);
  await openSlot(a.page, "Court 3", "20:00");
  const dialog = a.page.getByRole("dialog");
  await dialog.getByText("À payer au club").waitFor({ timeout: 10000 });
  await shot(a.page, "11-admin-match-dialog");
  await dialog.getByRole("button", { name: "Encaisser" }).click();
  await dialog.getByText("Espèces · payé").waitFor({ timeout: 10000 });
  await a.page.keyboard.press("Escape");
});

await step("admin creates a phone booking for a guest on the grid", async () => {
  await a.page.goto(`${WEB}/admin/reservations`);
  await a.page.getByRole("button", { name: /Nouvelle réservation/ }).click();
  const dialog = a.page.getByRole("dialog");
  await dialog.getByTestId("select-terrain").click();
  await a.page.getByRole("option", { name: "Court 4" }).click();
  const d = tomorrow.toISOString().slice(0, 10);
  await dialog.locator("#nb-date").fill(d);
  await dialog.getByRole("radio", { name: "14:00" }).click();
  await dialog.locator("#nb-guest").fill("Sami (téléphone)");
  await dialog.locator("#nb-phone").fill("+216 22 111 222");
  await shot(a.page, "12-admin-phone-booking");
  await dialog.getByTestId("btn-confirm-booking").click();
  await a.page.getByText("Réservation créée").first().waitFor({ timeout: 10000 });
});

await step("admin credits tokens from the members page (no double credit)", async () => {
  await a.page.goto(`${WEB}/admin/users`);
  await a.page.getByTestId("btn-manage-tokens-3").click();
  const dialog = a.page.getByRole("dialog");
  await dialog.getByTestId("input-token-amount").fill("4");
  await dialog.getByRole("button", { name: /Recharge à l'accueil/ }).click();
  await shot(a.page, "13-admin-token-dialog");
  const submit = dialog
    .getByRole("button", { name: /Créditer|Valider|Confirmer|Enregistrer/ })
    .last();
  await submit.dblclick();
  await a.page.waitForTimeout(1500);
  const r = await api(USERS.admin, "GET", "/tokens/admin/transactions?userId=3");
  const credits = r.body.data.filter((t) => t.type === "credit");
  assert(
    credits.length === 1 && credits[0].amount === 4,
    `credits: ${JSON.stringify(credits.map((c) => c.amount))}`,
  );
});

await step("token history shows the ledger", async () => {
  await a.page.goto(`${WEB}/admin/tokens`);
  await a.page.getByText("Recharge à l'accueil").first().waitFor({ timeout: 10000 });
  await shot(a.page, "14-admin-token-history");
});

await step("organiser cancels the own-spot match: token refunded", async () => {
  const before = (await api(USERS.yasmine, "GET", "/users/me")).body.tokenBalance;
  const r = await api(USERS.yasmine, "POST", `/reservations/${ownSpotId}/cancel`);
  assert(r.status === 200, `cancel ${r.status}`);
  const after = (await api(USERS.yasmine, "GET", "/users/me")).body.tokenBalance;
  assert(after === before + 1, `refund ${before} → ${after}`);
});

console.log("\nPublic & mobile");
const v = await as(null, { width: 375, height: 812 });
await step("public home (mobile)", async () => {
  await v.page.goto(`${WEB}/`);
  await v.page.waitForTimeout(2500);
  await shot(v.page, "15-home-mobile");
  const overflow = await v.page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  assert(overflow <= 1, `horizontal overflow ${overflow}px`);
});
await step("public planning (mobile, horizontal courts, sticky times)", async () => {
  await v.page.goto(`${WEB}/terrains`);
  await v.page.getByRole("columnheader", { name: /Court Central/ }).waitFor({ timeout: 15000 });
  await shot(v.page, "16-planning-mobile");
  const overflow = await v.page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  assert(overflow <= 1, `page overflows horizontally by ${overflow}px`);
});
await step("sign-up form has names, no broken Apple/Google buttons", async () => {
  await v.page.goto(`${WEB}/sign-up`);
  await v.page.locator("#first-name").waitFor();
  assert(
    (await v.page.getByRole("button", { name: /Apple/ }).count()) === 0,
    "Apple button present",
  );
  await shot(v.page, "17-signup-mobile");
});
await step("unknown route shows the 404 page", async () => {
  await v.page.goto(`${WEB}/nope-404`);
  await v.page
    .getByText(/404|introuvable|n'existe/i)
    .first()
    .waitFor({ timeout: 10000 });
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
process.exit(failed.length ? 1 : 0);
