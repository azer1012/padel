/**
 * What members see when things go wrong or when they do the unexpected: the API
 * is down or slow, a request is lost, a button is pressed twice, the page is
 * reloaded, the back button is used, the phone is small.
 */
import {
  API,
  USERS,
  WEB,
  api,
  as,
  assert,
  bookingCard,
  cell,
  equal,
  finish,
  launch,
  openSlot,
  overflow,
  pickDay,
  section,
  shot,
  slot,
  sql,
  step,
} from "./lib.mjs";

await launch();
const { yasmine: A, karim: B, admin: ADMIN } = USERS;

const balance = async (u) => (await api(u, "GET", "/users/me")).body.tokenBalance;
const bookings = async (court, hhmm, day) =>
  (
    await sql(
      "select id from reservations where terrain_id = $1 and start_time = $2 and status = 'confirmed'",
      [court, slot(hhmm, day)],
    )
  ).length;
/** No raw technical text may reach a member. */
const technical =
  /\b500\b|Internal Server|stack|TypeError|undefined|null|\[object|ECONN|fetch failed|SQL|postgres/i;

await api(ADMIN, "POST", "/tokens/admin/adjust", {
  userId: A.n,
  type: "credit",
  amount: 30,
  description: "Recharge de test",
  idempotencyKey: "res-a-30",
});

const a = await as(A);

// ════════════════════════════════════════════════════════════════════════════
section("The API is down, slow or wrong");

await step("planning: a clear message and a retry that works", async () => {
  await a.page.route("**/api/calendar*", (route) => route.abort());
  await a.page.goto(`${WEB}/terrains`);
  await a.page.getByText("Le planning n'a pas chargé").waitFor({ timeout: 20000 });
  await shot(a.page, "res-01-planning-down");
  assert(!technical.test(await a.page.locator("main").innerText()), "technical text on the page");
  await a.page.unroute("**/api/calendar*");
  await a.page.getByRole("button", { name: "Réessayer" }).click();
  await a.page.getByRole("columnheader", { name: /Court Central/ }).waitFor({ timeout: 15000 });
});

await step("planning: a slow answer shows a loading state, then the courts", async () => {
  await a.page.route("**/api/calendar*", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await a.page.goto(`${WEB}/terrains`);
  await a.page.getByLabel("Chargement du planning").waitFor({ timeout: 10000 });
  await a.page.getByRole("columnheader", { name: /Court Central/ }).waitFor({ timeout: 15000 });
  await a.page.unroute("**/api/calendar*");
});

await step("booking: a lost request charges nothing and can be tried again", async () => {
  const before = await balance(A);
  await a.page.goto(`${WEB}/terrains`);
  const dialog = await openSlot(a.page, "Court Central", "08:00", 2);
  await a.page.route("**/api/reservations", (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue(),
  );
  await dialog.getByRole("button", { name: "Confirmer la réservation" }).click();
  const toast = a.page.getByText("Réservation impossible").first();
  await toast.waitFor({ timeout: 15000 });
  await shot(a.page, "res-02-booking-lost");
  const text = await a.page.locator("body").innerText();
  assert(!/Failed to fetch|NetworkError|TypeError/.test(text), "raw network error shown");
  equal(await bookings(1, "08:00", 2), 0, "bookings after the lost request");
  equal(await balance(A), before, "balance after the lost request");
  await a.page.unroute("**/api/reservations");
  // Leave the double-press window of the button before trying again
  await a.page.waitForTimeout(600);
  await dialog.getByRole("button", { name: "Confirmer la réservation" }).click();
  await dialog.getByText("Réservation confirmée").waitFor({ timeout: 10000 });
  equal(await bookings(1, "08:00", 2), 1, "bookings after the retry");
  equal(await balance(A), before - 4, "balance after the retry");
});

await step("booking: a server error is told in plain words, never as a code", async () => {
  await a.page.goto(`${WEB}/terrains`);
  const dialog = await openSlot(a.page, "Court 2", "08:00", 2);
  await a.page.route("**/api/reservations", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Something went wrong. Please try again.",
            code: "INTERNAL_ERROR",
          }),
        })
      : route.continue(),
  );
  await dialog.getByRole("button", { name: "Confirmer la réservation" }).click();
  await a.page.getByText("Réservation impossible").first().waitFor({ timeout: 10000 });
  const shown = await a.page.locator("body").innerText();
  assert(
    !/INTERNAL_ERROR|\b500\b|Something went wrong/.test(shown),
    `raw error shown: ${shown.match(/.{0,40}(INTERNAL_ERROR|500|Something went wrong).{0,40}/)?.[0]}`,
  );
  await a.page.unroute("**/api/reservations");
  await a.page.keyboard.press("Escape");
});

await step("booking: pressing Confirm again and again on a slow network books once", async () => {
  const before = await balance(A);
  await a.page.goto(`${WEB}/terrains`);
  const dialog = await openSlot(a.page, "Court 3", "08:00", 2);
  let posts = 0;
  await a.page.route("**/api/reservations", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts++;
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  const confirm = dialog.getByRole("button", { name: /Confirmer la réservation|Réservation…/ });
  await confirm.dblclick();
  for (let i = 0; i < 4; i++) await confirm.click({ force: true, timeout: 1000 }).catch(() => {});
  await dialog.getByText("Réservation confirmée").waitFor({ timeout: 15000 });
  await a.page.unroute("**/api/reservations");
  equal(posts, 1, "requests sent");
  equal(await bookings(3, "08:00", 2), 1, "bookings");
  equal(await balance(A), before - 4, "balance");
});

await step("open matches and the dashboard keep their shape without the API", async () => {
  const p = await as(A);
  await p.page.route("**/api/**", (route) => route.abort());
  await p.page.goto(`${WEB}/open-matches`);
  await p.page.getByText("Les open matches n'ont pas chargé.").waitFor({ timeout: 20000 });
  for (const route of ["/dashboard", "/reservations", "/wallet", "/profile"]) {
    await p.page.goto(WEB + route);
    await p.page.locator("main").waitFor({ timeout: 10000 });
    await p.page.waitForTimeout(2500);
    const text = await p.page.locator("body").innerText();
    assert(text.trim().length > 40, `${route} is blank without the API`);
    assert(
      !/Failed to fetch|TypeError|Cannot read|undefined/.test(text),
      `${route} shows a raw error`,
    );
  }
  await shot(p.page, "res-03-profile-api-down");
  equal(
    p.page.problems.filter((x) => x.startsWith("pageerror")).length,
    0,
    `page errors: ${p.page.problems.join(" | ")}`,
  );
  await p.ctx.close();
});

await step(
  "a session refused by the API sends the member back to sign-in, not to a dead page",
  async () => {
    const p = await as(A);
    await p.page.route("**/api/**", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      }),
    );
    await p.page.goto(`${WEB}/dashboard`);
    await p.page.waitForTimeout(3000);
    const text = await p.page.locator("body").innerText();
    await shot(p.page, "res-04-session-refused");
    assert(text.trim().length > 40, "blank page when the API refuses the session");
    assert(!/Unauthorized|UNAUTHORIZED|401/.test(text), "raw refusal shown to the member");
    equal(p.page.problems.filter((x) => x.startsWith("pageerror")).length, 0, "page errors");
    await p.ctx.close();
  },
);

await step("a dead invitation link explains itself", async () => {
  const p = await as(B, { width: 390, height: 844 });
  await p.page.goto(`${WEB}/join/this-link-does-not-exist-0000`);
  await p.page.getByText("Invitation indisponible").waitFor({ timeout: 15000 });
  await p.page.getByRole("link", { name: "Voir les open matches" }).waitFor();
  await p.ctx.close();
});

await step("the API answers bad requests with a clean refusal, never a crash", async () => {
  const cases = [
    ["POST", "/reservations", "{not json", 400, "BAD_JSON"],
    [
      "POST",
      "/reservations",
      { terrainId: "abc", startTime: slot("08:00", 3) },
      400,
      "VALIDATION_ERROR",
    ],
    [
      "POST",
      "/reservations",
      { terrainId: 999999, startTime: slot("08:00", 3) },
      400,
      "COURT_UNAVAILABLE",
    ],
    ["POST", "/reservations", { terrainId: 1, startTime: "not-a-date" }, 400, "INVALID_SLOT"],
    ["POST", "/reservations", { terrainId: 1 }, 400, "INVALID_SLOT"],
    [
      "POST",
      "/reservations",
      { terrainId: 1, startTime: slot("08:00", 3), bookingMode: "half" },
      400,
      "VALIDATION_ERROR",
    ],
    [
      "POST",
      "/reservations",
      { terrainId: -1, startTime: slot("08:00", 3) },
      400,
      "VALIDATION_ERROR",
    ],
    ["POST", "/reservations", { terrainId: 1, startTime: slot("08:00", -3) }, 400, "SLOT_IN_PAST"],
    [
      "POST",
      "/reservations",
      { terrainId: 1, startTime: slot("08:00", 400) },
      400,
      "TOO_FAR_AHEAD",
    ],
    [
      "POST",
      "/reservations",
      { terrainId: 1, startTime: "2026-13-45T99:99:00Z" },
      400,
      "INVALID_SLOT",
    ],
    ["GET", "/reservations/abc", undefined, 400, "VALIDATION_ERROR"],
    ["GET", "/reservations/0", undefined, 400, "VALIDATION_ERROR"],
    ["GET", "/reservations/99999999999999999999", undefined, 400, "VALIDATION_ERROR"],
    ["GET", "/reservations/999999", undefined, 404, "NOT_FOUND"],
    ["POST", "/reservations/999999/cancel", undefined, 404, "NOT_FOUND"],
    ["POST", "/reservations/999999/join", {}, 404, "NOT_FOUND"],
    ["POST", "/reservations/1/invite", { userId: "x" }, 400, "VALIDATION_ERROR"],
    ["POST", "/reservations/1/invite", { userId: 999999 }, 404, "USER_NOT_FOUND"],
    ["GET", "/reservations?date=2026-99-99", undefined, 400, "VALIDATION_ERROR"],
    ["GET", "/calendar?date=yesterday", undefined, 400, "VALIDATION_ERROR"],
    ["PATCH", "/users/me", { language: "klingon" }, 400, "VALIDATION_ERROR"],
    ["PATCH", "/users/me", { phone: "<script>alert(1)</script>" }, 400, "VALIDATION_ERROR"],
    ["GET", "/nothing-here", undefined, 404, "NOT_FOUND"],
  ];
  for (const [method, path, body, status, code] of cases) {
    const r = await api(A, method, path, body);
    equal(r.status, status, `${method} ${path} ${JSON.stringify(body ?? "")}`);
    equal(r.body?.code, code, `code of ${method} ${path} ${JSON.stringify(body ?? "")}`);
    assert(
      !/stack|\bat \w+ \(|node_modules|drizzle|select |insert /i.test(JSON.stringify(r.body)),
      `leak in ${JSON.stringify(r.body)}`,
    );
  }
  const adminCases = [
    ["POST", "/tokens/admin/adjust", { userId: A.n, type: "credit", amount: -5, description: "x" }],
    ["POST", "/tokens/admin/adjust", { userId: A.n, type: "credit", amount: 0, description: "x" }],
    [
      "POST",
      "/tokens/admin/adjust",
      { userId: A.n, type: "credit", amount: 1.5, description: "x" },
    ],
    [
      "POST",
      "/tokens/admin/adjust",
      { userId: A.n, type: "credit", amount: 100000, description: "x" },
    ],
    [
      "POST",
      "/tokens/admin/adjust",
      { userId: A.n, type: "credit", amount: "ten", description: "x" },
    ],
    ["POST", "/tokens/admin/adjust", { userId: A.n, type: "gift", amount: 5, description: "x" }],
    ["POST", "/tokens/admin/adjust", { userId: A.n, type: "credit", amount: 5 }],
    ["POST", "/tokens/admin/adjust", { userId: A.n, type: "debit", amount: 999, description: "x" }],
    [
      "POST",
      "/tokens/admin/adjust",
      { userId: A.n, type: "credit", amount: 5, description: "x", cashAmount: -1 },
    ],
    ["PATCH", "/admin/settings", { playerPrice: -1 }],
    ["PATCH", "/admin/settings", { bookingDurationMinutes: 7 }],
    ["PATCH", "/admin/settings", { bookingDurationMinutes: -90 }],
    ["PATCH", "/admin/settings", { maxPlayers: 0 }],
    ["PATCH", "/admin/settings", { maxPlayers: 99 }],
    ["PATCH", "/admin/settings", { tokenCostPlayer: -1 }],
    ["PATCH", "/admin/settings", { lateCancellation: "maybe" }],
    ["POST", "/terrains", { name: "" }],
    ["POST", "/admin/slots/block", { terrainId: 1, startTime: "soon" }],
    ["PUT", "/admin/opening-hours", { days: [] }],
    ["POST", "/admin/schedule-exceptions", { date: "tomorrow" }],
  ];
  const before = await balance(A);
  const settings = JSON.stringify((await api(ADMIN, "GET", "/settings")).body);
  for (const [method, path, body] of adminCases) {
    const r = await api(ADMIN, method, path, body);
    equal(r.status, 400, `${method} ${path} ${JSON.stringify(body)}`);
    assert(
      typeof r.body?.code === "string",
      `no code for ${method} ${path} ${JSON.stringify(body)}`,
    );
  }
  equal(await balance(A), before, "balance after the refused operations");
  equal(
    JSON.stringify((await api(ADMIN, "GET", "/settings")).body),
    settings,
    "settings after the refused changes",
  );
  const big = await api(A, "POST", "/reservations", JSON.stringify({ notes: "x".repeat(200_000) }));
  equal(big.status, 413, "oversized request");
  const rows = await sql("select * from token_ledger_audit");
  equal(rows.length, 0, "ledger mismatches after the bad requests");
});

// ════════════════════════════════════════════════════════════════════════════
section("Reload, back and forward");

await step(
  "a reload keeps the member signed in, on the same page, with the same data",
  async () => {
    for (const [route, marker] of [
      ["/dashboard", /Yasmine/],
      ["/terrains", /Court Central/],
      ["/reservations", /Mes réservations/],
      ["/wallet", /Votre solde/],
      ["/profile", /Votre profil/],
      ["/open-matches", /Open matches|partenaire/],
    ]) {
      await a.page.goto(WEB + route);
      await a.page.getByText(marker).first().waitFor({ timeout: 15000 });
      await a.page.reload();
      await a.page.getByText(marker).first().waitFor({ timeout: 15000 });
      equal(new URL(a.page.url()).pathname, route, `path after reloading ${route}`);
    }
    const ad = await as(ADMIN);
    for (const route of [
      "/admin",
      "/admin/reservations",
      "/admin/users",
      "/admin/tokens",
      "/admin/settings",
    ]) {
      await ad.page.goto(WEB + route);
      await ad.page.locator("main h1").first().waitFor({ timeout: 15000 });
      const title = await ad.page.locator("main h1").first().innerText();
      await ad.page.reload();
      await ad.page.locator("main h1").first().waitFor({ timeout: 15000 });
      equal(
        await ad.page.locator("main h1").first().innerText(),
        title,
        `title after reloading ${route}`,
      );
      equal(new URL(ad.page.url()).pathname, route, `path after reloading ${route}`);
    }
    await ad.ctx.close();
  },
);

await step("reloading or going back after a booking never books again", async () => {
  const before = await balance(A);
  await a.page.goto(`${WEB}/terrains`);
  const dialog = await openSlot(a.page, "Court 4", "08:00", 2);
  await dialog.getByRole("button", { name: "Confirmer la réservation" }).click();
  await dialog.getByText("Réservation confirmée").waitFor({ timeout: 10000 });
  await dialog.getByRole("link", { name: /Voir ma réservation/ }).click();
  await a.page.waitForURL(/\/reservations$/, { timeout: 10000 });
  await a.page.goBack();
  await a.page.waitForURL(/\/terrains$/, { timeout: 10000 });
  equal(await a.page.getByRole("dialog").count(), 0, "booking dialog reopened by the back button");
  await a.page.goForward();
  await a.page.waitForURL(/\/reservations$/, { timeout: 10000 });
  await a.page.reload();
  await a.page.getByText("Mes réservations").first().waitFor({ timeout: 15000 });
  equal(await bookings(4, "08:00", 2), 1, "bookings");
  equal(await balance(A), before - 4, "balance");
});

await step("the back button leaves the sign-in page instead of looping on it", async () => {
  const v = await as(null);
  await v.page.goto(`${WEB}/`);
  await v.page.getByRole("heading").first().waitFor({ timeout: 15000 });
  await v.page.goto(`${WEB}/tournaments`);
  await v.page.getByRole("heading").first().waitFor({ timeout: 15000 });
  await v.page.evaluate(() => {
    window.history.pushState(null, "", "/wallet");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await v.page.waitForURL(/\/sign-in\?redirect=%2Fwallet/, { timeout: 10000 });
  await v.page.goBack();
  await v.page.waitForTimeout(800);
  equal(new URL(v.page.url()).pathname, "/tournaments", "page after going back from sign-in");
  await v.ctx.close();
});

// ════════════════════════════════════════════════════════════════════════════
section("Booking on a phone");

await step("from the planning to a cancelled match, all with a thumb", async () => {
  const before = await balance(A);
  const m = await as(A, { width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  await m.page.goto(`${WEB}/terrains`);
  await pickDay(m.page, 3);
  await m.page.getByRole("columnheader", { name: /Court Central/ }).waitFor({ timeout: 15000 });
  equal((await overflow(m.page)) <= 1, true, "page wider than the phone");
  // The courts scroll sideways inside the planning; the times stay in view
  await cell(m.page, "Court 4", "09:30").scrollIntoViewIfNeeded();
  assert(await m.page.getByRole("rowheader").first().isVisible(), "times scrolled away");
  await cell(m.page, "Court 4", "09:30").tap();
  const dialog = m.page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /Juste ma place/ }).tap();
  const confirm = dialog.getByRole("button", { name: "Confirmer la réservation" });
  await confirm.scrollIntoViewIfNeeded();
  const box = await confirm.boundingBox();
  assert(
    box.x >= 0 && box.x + box.width <= 390,
    `confirm button off screen: ${JSON.stringify(box)}`,
  );
  assert(box.height >= 44, `confirm button too small for a thumb: ${box.height}px`);
  await shot(m.page, "res-05-mobile-book-dialog");
  await confirm.tap();
  await dialog.getByText("Réservation confirmée").waitFor({ timeout: 10000 });
  await dialog.locator("code").waitFor({ timeout: 10000 });
  equal((await overflow(m.page)) <= 1, true, "confirmation wider than the phone");
  await shot(m.page, "res-06-mobile-booked");
  equal(await balance(A), before - 1, "balance after booking");
  await dialog.getByRole("link", { name: /Voir ma réservation/ }).tap();
  await m.page.waitForURL(/\/reservations$/, { timeout: 10000 });
  const card = bookingCard(m.page, "Court 4").last();
  await card.getByRole("button", { name: "Inviter" }).tap();
  await m.page.getByPlaceholder("Nom ou e-mail exact").fill("Karim");
  await m.page
    .getByRole("listitem")
    .filter({ hasText: /^Karim B\./ })
    .getByRole("button", { name: "Inviter" })
    .tap();
  await m.page
    .getByRole("listitem")
    .filter({ hasText: /^Karim B\./ })
    .getByText("Invité")
    .waitFor({ timeout: 10000 });
  equal((await overflow(m.page)) <= 1, true, "invitation panel wider than the phone");
  await shot(m.page, "res-07-mobile-invite");
  await card.getByRole("button", { name: "Annuler" }).tap();
  const sure = m.page.getByRole("alertdialog");
  const yes = sure.getByRole("button", { name: "Annuler le match" });
  const yesBox = await yes.boundingBox();
  assert(
    yesBox.x >= 0 && yesBox.x + yesBox.width <= 390 && yesBox.y + yesBox.height <= 844,
    "cancel confirmation off screen",
  );
  await yes.tap();
  await m.page.getByText("Réservation annulée").first().waitFor({ timeout: 10000 });
  equal(await balance(A), before, "balance after cancelling");
  equal((await api(B, "GET", "/invites")).body.length, 0, "invitations left for a cancelled match");
  equal(
    m.page.problems.filter((p) => !/status of 4\d\d/.test(p)).length,
    0,
    m.page.problems.join(" | "),
  );
  await m.ctx.close();
});

await step(
  "the phone menu reaches every member page, and signing out is one tap away",
  async () => {
    const m = await as(A, { width: 375, height: 700 }, { hasTouch: true, isMobile: true });
    await m.page.goto(`${WEB}/dashboard`);
    const tabs = m.page.getByRole("navigation", { name: "Navigation principale" });
    await tabs.waitFor({ timeout: 15000 });
    for (const [name, path] of [
      ["Réserver", "/terrains"],
      ["Mes résas", "/reservations"],
      ["Accueil", "/dashboard"],
    ]) {
      await tabs.getByRole("link", { name }).tap();
      await m.page.waitForURL(new RegExp(`${path}$`), { timeout: 10000 });
    }
    await tabs.getByRole("button", { name: "Plus" }).tap();
    const menu = m.page.getByRole("dialog", { name: "Menu" });
    await menu.waitFor({ timeout: 5000 });
    await shot(m.page, "res-08-mobile-menu");
    await menu.getByRole("button", { name: "Se déconnecter" }).tap();
    await m.page.waitForURL(/\/sign-in/, { timeout: 10000 });
    await m.ctx.close();
  },
);

// ════════════════════════════════════════════════════════════════════════════
section("Keyboard");

await step(
  "a slot can be booked without a mouse; focus stays in the dialog and comes back",
  async () => {
    const k = await as(A);
    await k.page.goto(`${WEB}/terrains`);
    await pickDay(k.page, 3);
    const target = cell(k.page, "Court 2", "09:30");
    await target.waitFor({ timeout: 15000 });
    await target.focus();
    await k.page.keyboard.press("Enter");
    const dialog = k.page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });
    const inside = () =>
      k.page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
    assert(await inside(), "focus not moved into the dialog");
    for (let i = 0; i < 25; i++) {
      await k.page.keyboard.press("Tab");
      assert(await inside(), `focus left the dialog after ${i + 1} Tab`);
    }
    const outline = await k.page.evaluate(() => {
      const s = getComputedStyle(document.activeElement);
      return `${s.outlineStyle} ${s.outlineWidth} ${s.boxShadow}`;
    });
    assert(!/^none 0px none$/.test(outline), `no visible focus ring: ${outline}`);
    await k.page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden", timeout: 5000 });
    await k.page
      .waitForFunction(
        () => /^Court 2 09:30/.test(document.activeElement?.getAttribute("aria-label") ?? ""),
        null,
        { timeout: 3000 },
      )
      .catch(() => {});
    const back = await k.page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    assert(/^Court 2 09:30/.test(back ?? ""), `focus after closing: ${back}`);
    await k.ctx.close();
  },
);

await step("the skip link and the sign-in form work from the keyboard alone", async () => {
  const k = await as(null);
  await k.page.goto(`${WEB}/`);
  await k.page.getByRole("heading").first().waitFor({ timeout: 15000 });
  await k.page.keyboard.press("Tab");
  const first = await k.page.evaluate(() => document.activeElement?.textContent);
  equal(first?.trim(), "Aller au contenu", "first focusable element");
  await k.page.goto(`${WEB}/sign-in`);
  await k.page.locator("#email").focus();
  await k.page.keyboard.type(A.email);
  await k.page.keyboard.press("Tab");
  // "Mot de passe oublié ?" sits between the two fields
  if ((await k.page.evaluate(() => document.activeElement?.id)) !== "password")
    await k.page.keyboard.press("Tab");
  equal(
    await k.page.evaluate(() => document.activeElement?.id),
    "password",
    "field after the e-mail",
  );
  await k.page.keyboard.type(process.env.E2E_PASSWORD ?? "Padel-e2e-2026");
  await k.page.keyboard.press("Enter");
  await k.page.waitForURL(/\/dashboard$/, { timeout: 15000 });
  await k.ctx.close();
});

await step("health of the server after all the abuse", async () => {
  equal((await fetch(`${API}/healthz`)).status, 200, "health check");
  const rows = await sql(
    `select a.id from reservations a join reservations b on a.terrain_id = b.terrain_id and a.id < b.id
     and a.status = 'confirmed' and b.status = 'confirmed' and a.start_time < b.end_time and b.start_time < a.end_time`,
  );
  equal(rows.length, 0, "overlapping bookings");
  equal((await sql("select * from token_ledger_audit")).length, 0, "ledger mismatches");
});

await finish();
