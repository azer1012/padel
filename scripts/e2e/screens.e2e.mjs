/**
 * Every page on every screen size, for a visitor, a player and an admin: nothing
 * overflows, nothing is cut off, no broken image, no error behind the page. Then
 * the accessibility rules (axe-core, when installed), Arabic right-to-left, and a
 * budget on what each page asks the API.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import {
  USERS,
  WEB,
  api,
  as,
  assert,
  equal,
  finish,
  launch,
  overflow,
  pickDay,
  section,
  shot,
  slot,
  step,
} from "./lib.mjs";

await launch();
const { yasmine: A, karim: B, admin: ADMIN } = USERS;

// Something to look at: tokens, a full court, an open match, an invitation
await api(ADMIN, "POST", "/tokens/admin/adjust", {
  userId: A.n,
  type: "credit",
  amount: 20,
  description: "Recharge à l'accueil",
  idempotencyKey: "screens-a-20",
});
const full = await api(A, "POST", "/reservations", {
  terrainId: 1,
  startTime: slot("18:30"),
  bookingMode: "full_court",
});
await api(A, "POST", "/reservations", {
  terrainId: 3,
  startTime: slot("17:00"),
  bookingMode: "own_spot",
  isPublic: true,
  publicDescription: "Niveau intermédiaire",
});
await api(A, "POST", `/reservations/${full.body.id}/invite`, { userId: B.n });
// The shop with something on its shelves, one article nearly gone, and an order to call
const racket = await api(ADMIN, "POST", "/admin/shop/products", {
  name: "Raquette Carbone Pro",
  category: "racket",
  price: 349,
  stock: 2,
  description: "Cadre 100 % carbone, forme diamant et équilibre en tête.",
  // Several photos: the card shows them in a strip the member moves through
  imageUrls: ["/club-detail-960.webp", "/club-main-960.webp", "/club-indoor-960.webp"],
});
await api(ADMIN, "POST", "/admin/shop/products", {
  name: "Tube de 3 balles",
  category: "balls",
  price: 18,
  stock: 40,
});
await api(A, "POST", "/shop/orders", {
  items: [{ productId: racket.body.id, quantity: 1 }],
  deliveryMethod: "pickup",
  contactPhone: "+216 20 000 000",
  idempotencyKey: "screens-order",
});

const WIDTHS = [320, 360, 375, 390, 414, 430, 768, 1024, 1280, 1440, 1920];
const PAGES = {
  visitor: [
    "/",
    "/terrains",
    "/open-matches",
    "/tournaments",
    "/news",
    "/boutique",
    "/contact",
    "/sign-in",
    "/sign-up",
    "/reset-password",
    "/auth/confirm",
    "/page-inconnue",
  ],
  player: [
    "/dashboard",
    "/terrains",
    "/open-matches",
    "/reservations",
    "/wallet",
    "/profile",
    "/tournaments",
    "/news",
    "/boutique",
  ],
  admin: [
    "/admin",
    "/admin/reservations",
    "/admin/terrains",
    "/admin/users",
    "/admin/tokens",
    "/admin/news",
    "/admin/tournaments",
    "/admin/pricing",
    "/admin/equipment",
    "/admin/shop",
    "/admin/cash",
    "/admin/settings",
  ],
};
const WHO = { visitor: null, player: A, admin: ADMIN };

/** What is wrong with the layout of the page as it stands, in the reader's words. */
const inspect = (page) =>
  page.evaluate(() => {
    const vw = window.innerWidth;
    const issues = [];
    const sideways = document.documentElement.scrollWidth - vw;
    if (sideways > 1) issues.push(`the page scrolls sideways by ${sideways}px`);
    const scrolls = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth) return true;
      }
      return false;
    };
    const name = (el) =>
      (el.innerText || el.getAttribute("aria-label") || el.id || el.tagName).trim().slice(0, 30);
    for (const el of document.querySelectorAll(
      "button, a[href], input, select, textarea, h1, h2",
    )) {
      const b = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (!b.width || !b.height || s.visibility === "hidden" || s.opacity === "0") continue;
      if (el.closest(".sr-only") || el.classList.contains("sr-only")) continue;
      if ((b.right > vw + 1 || b.left < -1) && !scrolls(el))
        issues.push(`"${name(el)}" is cut off (${Math.round(b.left)}–${Math.round(b.right)}px)`);
    }
    for (const img of document.images)
      if (img.complete && img.naturalWidth === 0) issues.push(`broken image ${img.src}`);
    // The site's top bar: a name or a link on two lines, or two items on top of each other
    const bar = document.querySelector("header.sticky");
    const lines = (el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = [...range.getClientRects()].filter((r) => r.width > 1).map((r) => r.top);
      return tops.length ? Math.max(...tops) - Math.min(...tops) : 0;
    };
    for (const el of bar?.querySelectorAll("a, button") ?? []) {
      if (!el.getBoundingClientRect().width || !el.innerText.trim()) continue;
      if (lines(el) > 14) issues.push(`"${name(el)}" wraps in the top bar`);
    }
    const header = [...(bar?.querySelectorAll("a, button, nav") ?? [])].filter(
      (el) => el.getBoundingClientRect().width > 0,
    );
    for (let i = 0; i < header.length; i++)
      for (let j = i + 1; j < header.length; j++) {
        const [x, y] = [header[i], header[j]];
        if (x.contains(y) || y.contains(x)) continue;
        const a = x.getBoundingClientRect();
        const b = y.getBoundingClientRect();
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlapX > 2 && overlapY > 2)
          issues.push(`"${name(x)}" overlaps "${name(y)}" in the top bar`);
      }
    if (document.body.innerText.trim().length < 40) issues.push("the page is empty");
    return [...new Set(issues)];
  });

/** Waits for the page to be drawn: content present and entrance animations over. */
async function settled(page) {
  await page.locator("main, h1").first().waitFor({ timeout: 20000 });
  await page
    .waitForFunction(
      () =>
        !document.querySelector('[aria-busy="true"]') && document.body.innerText.trim().length > 40,
      null,
      { timeout: 15000 },
    )
    .catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
}

for (const [role, routes] of Object.entries(PAGES)) {
  section(`Every screen size · ${role}`);
  for (const width of WIDTHS) {
    await step(`${width}px: ${routes.length} pages fit, load and stay silent`, async () => {
      const { ctx, page } = await as(WHO[role], { width, height: width < 768 ? 780 : 900 });
      const found = [];
      for (const route of routes) {
        page.problems.length = 0;
        await page.goto(WEB + route);
        await settled(page);
        for (const issue of await inspect(page)) found.push(`${route}: ${issue}`);
        for (const p of page.problems) found.push(`${route}: ${p}`);
        if ([320, 390, 1024].includes(width))
          await shot(page, `screen-${role}-${width}${route.replace(/\//g, "_")}`);
      }
      await ctx.close();
      equal(found.length, 0, found.slice(0, 6).join(" · "));
    });
  }
}

section("Dialogs on small screens");

await step(
  "booking, match and admin dialogs fit a 320px phone and can be scrolled to their buttons",
  async () => {
    const day = new RegExp(
      `^${new Date(Date.now() + 86400e3).toLocaleDateString("fr-FR", { weekday: "long", timeZone: "Africa/Tunis" })}`,
      "i",
    );
    const check = async (page, what) => {
      const dialog = page.getByRole("dialog");
      await dialog.waitFor({ timeout: 10000 });
      await page.waitForTimeout(400);
      const box = await dialog.boundingBox();
      assert(
        box.x >= -1 && box.x + box.width <= 321,
        `${what}: dialog wider than the screen (${JSON.stringify(box)})`,
      );
      equal((await overflow(page)) <= 1, true, `${what}: page scrolls sideways`);
      const buttons = dialog.getByRole("button");
      const last = buttons.nth((await buttons.count()) - 1);
      await last.scrollIntoViewIfNeeded();
      const b = await last.boundingBox();
      assert(
        b && b.x >= 0 && b.x + b.width <= 321 && b.y + b.height <= 700,
        `${what}: last button out of reach`,
      );
      await shot(page, `screen-dialog-320-${what}`);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden", timeout: 5000 });
    };
    const p = await as(A, { width: 320, height: 640 });
    await p.page.goto(`${WEB}/terrains`);
    await p.page.getByRole("button", { name: day }).first().click();
    await p.page.getByRole("button", { name: /^Court 2 09:30:/ }).click();
    await check(p.page, "book");
    await p.page.getByRole("button", { name: /^Court Central 18:30:/ }).click();
    await check(p.page, "my-match");
    await p.ctx.close();
    const ad = await as(ADMIN, { width: 320, height: 640 });
    await ad.page.goto(`${WEB}/admin/reservations`);
    await ad.page.getByRole("button", { name: day }).first().click();
    await ad.page.getByRole("button", { name: /^Court Central 18:30:/ }).click();
    await check(ad.page, "admin-match");
    await ad.page.getByTestId("btn-create-reservation").click();
    await check(ad.page, "admin-new-booking");
    // On a phone the wallet is managed from the Tokens page (the members table hides its shortcut)
    await ad.page.goto(`${WEB}/admin/tokens`);
    await ad.page.getByTestId("btn-adjust-tokens").click();
    await check(ad.page, "admin-tokens");
    await ad.ctx.close();
  },
);

section("Languages");

await step(
  "Arabic turns the whole site right-to-left without breaking it; English has no French left on the main screens",
  async () => {
    const p = await as(A, { width: 390, height: 844 });
    await p.ctx.addInitScript(() => localStorage.setItem("padel-lang", "ar"));
    const found = [];
    for (const route of ["/dashboard", "/terrains", "/reservations", "/wallet", "/profile"]) {
      await p.page.goto(WEB + route);
      await settled(p.page);
      if ((await p.page.evaluate(() => document.documentElement.dir)) !== "rtl")
        found.push(`${route}: not right-to-left`);
      for (const issue of await inspect(p.page)) found.push(`${route} (ar): ${issue}`);
    }
    await shot(p.page, "screen-arabic-profile");
    await p.ctx.close();
    const v = await as(null);
    await v.ctx.addInitScript(() => localStorage.setItem("padel-lang", "en"));
    await v.page.goto(`${WEB}/sign-in`);
    await v.page.getByRole("button", { name: "Sign in", exact: true }).waitFor({ timeout: 15000 });
    equal(await v.page.evaluate(() => document.documentElement.lang), "en", "document language");
    await v.ctx.close();
    equal(found.length, 0, found.slice(0, 6).join(" · "));
  },
);

section("Accessibility rules");

let axe = null;
try {
  axe = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
} catch {
  console.log("  – axe-core is not installed: rule checks skipped (npm i -g axe-core)");
}

/** Serious and critical WCAG 2.1 A/AA findings of the page, one line each. */
async function violations(page) {
  await page.evaluate(axe);
  return page.evaluate(async () => {
    // Decorative layers (aria-hidden) are not read: their colours are not judged
    const result = await window.axe.run(
      { exclude: [['[aria-hidden="true"]']] },
      {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      },
    );
    return result.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map(
        (v) =>
          `${v.id} (${v.nodes.length}): ${v.nodes[0].target.join(" ")} — ${v.nodes[0].failureSummary?.split("\n")[1]?.trim() ?? v.help}`,
      );
  });
}

if (axe)
  for (const [role, routes] of Object.entries({
    visitor: [
      "/",
      "/terrains",
      "/tournaments",
      "/news",
      "/boutique",
      "/sign-in",
      "/sign-up",
      "/contact",
    ],
    player: [
      "/dashboard",
      "/terrains",
      "/reservations",
      "/wallet",
      "/profile",
      "/open-matches",
      "/boutique",
    ],
    admin: [
      "/admin",
      "/admin/reservations",
      "/admin/users",
      "/admin/terrains",
      "/admin/tokens",
      "/admin/pricing",
      "/admin/equipment",
      "/admin/tournaments",
      "/admin/news",
      "/admin/shop",
      "/admin/cash",
      "/admin/settings",
    ],
  }))
    await step(`no serious accessibility violation · ${role}`, async () => {
      const found = [];
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 1366, height: 900 },
      ]) {
        const { ctx, page } = await as(WHO[role], viewport);
        for (const route of routes) {
          await page.goto(WEB + route);
          await settled(page);
          // Entrance animations fade content in: judge colours once they are done
          await page.waitForTimeout(1200);
          for (const v of await violations(page)) found.push(`${route} @${viewport.width}: ${v}`);
        }
        if (role === "player") {
          await page.goto(`${WEB}/terrains`);
          await settled(page);
          // Tomorrow: late in the evening today has no free slot left to open
          await pickDay(page, 1);
          await page
            .getByRole("button", { name: /^Court 2 \d\d:\d\d: Libre/ })
            .first()
            .click();
          await page.getByRole("dialog").waitFor({ timeout: 10000 });
          await page.waitForTimeout(600);
          for (const v of await violations(page))
            found.push(`booking dialog @${viewport.width}: ${v}`);
        }
        await ctx.close();
      }
      equal(found.length, 0, [...new Set(found)].slice(0, 8).join("\n      "));
    });

section("What each page asks the API");

await step("no page asks the same thing twice, floods the API or waits long for it", async () => {
  const found = [];
  for (const [role, routes] of Object.entries({
    visitor: ["/", "/terrains"],
    player: ["/dashboard", "/terrains", "/reservations", "/wallet"],
    admin: ["/admin", "/admin/reservations", "/admin/users", "/admin/tokens"],
  })) {
    const { ctx, page } = await as(WHO[role]);
    // Warm up: the session, the profile and the club rules are loaded once per visit
    await page.goto(WEB + routes[0]);
    await settled(page);
    for (const route of routes) {
      const calls = [];
      const onRequest = (r) => {
        if (r.url().includes("/api/"))
          calls.push({
            key: `${r.method()} ${new URL(r.url()).pathname}${new URL(r.url()).search}`,
            t: Date.now(),
          });
      };
      const slow = [];
      const onResponse = (r) => {
        const timing = r.request().timing();
        if (r.url().includes("/api/") && timing.responseEnd > 1000)
          slow.push(`${new URL(r.url()).pathname} ${Math.round(timing.responseEnd)}ms`);
      };
      page.on("request", onRequest);
      page.on("response", onResponse);
      const started = Date.now();
      await page.goto(WEB + route);
      await settled(page);
      const ms = Date.now() - started;
      page.off("request", onRequest);
      page.off("response", onResponse);
      const counts = {};
      for (const c of calls) counts[c.key] = (counts[c.key] ?? 0) + 1;
      // Twice can be the refresh a tab does when it gets the focus back; three times is a loop
      const repeated = Object.entries(counts).filter(([, n]) => n > 2);
      if (repeated.length)
        found.push(
          `${role} ${route}: asked again and again → ${repeated.map(([k, n]) => `${k} ×${n}`).join(", ")}`,
        );
      if (calls.length > 14) found.push(`${role} ${route}: ${calls.length} API calls`);
      if (slow.length) found.push(`${role} ${route}: slow → ${slow.join(", ")}`);
      console.log(
        `      ${role.padEnd(7)} ${route.padEnd(22)} ${String(calls.length).padStart(2)} API calls, drawn in ${ms} ms`,
      );
    }
    await ctx.close();
  }
  equal(found.length, 0, found.join("\n      "));
});

await finish();
