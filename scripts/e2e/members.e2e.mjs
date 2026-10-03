/**
 * What members and the desk could not do before: rent gear for a booking already made,
 * read one notification, see older wallet movements, block a member, delete one's own
 * account, and close the day's cash.
 */
import { readFileSync } from "node:fs";
import {
  USERS,
  WEB,
  api,
  as,
  assert,
  clubDay,
  equal,
  finish,
  launch,
  overflow,
  section,
  shot,
  slot,
  sql,
  step,
} from "./lib.mjs";

await launch();
const { yasmine: A, karim: B, ines: C, dalia: D, admin: ADMIN } = USERS;
const credit = (u, amount, key, extra = {}) =>
  api(ADMIN, "POST", "/tokens/admin/adjust", {
    userId: u.n,
    type: "credit",
    amount,
    description: "Recharge à l'accueil",
    idempotencyKey: key,
    ...extra,
  });

equal((await credit(A, 20, "members-a-20")).status, 200, "tokens for A");
const match = await api(A, "POST", "/reservations", {
  terrainId: 3,
  startTime: slot("17:00"),
  bookingMode: "own_spot",
});
equal(match.status, 201, "A's booking");
equal(
  (
    await api(ADMIN, "POST", "/admin/equipment", {
      name: "Raquette de location",
      category: "racket",
      price: 5,
      stock: 4,
    })
  ).status,
  201,
  "rental racket",
);

// ════════════════════════════════════════════════════════════════════════════
section("A member, on their own bookings and wallet");
const a = await as(A);

await step("gear is rented for a booking already made, paid at the desk", async () => {
  await a.page.goto(`${WEB}/reservations`);
  await a.page.getByTestId(`btn-gear-${match.body.id}`).click();
  const dialog = a.page.getByRole("dialog");
  const add = dialog.getByRole("button", { name: "Ajouter Raquette de location" });
  await add.click();
  await add.click();
  await dialog.getByText("À régler à l'accueil : 10 TND").waitFor();
  await shot(a.page, "members-01-gear");
  await dialog.getByTestId("btn-add-gear").click();
  await a.page.getByText("Matériel réservé").first().waitFor({ timeout: 10000 });
  const rows = await sql(
    "select quantity, status from reservation_equipment where reservation_id = $1",
    [match.body.id],
  );
  equal(rows.length, 1, "rental lines");
  equal(rows[0].quantity, 2, "rackets");
});

await step("opening one notification reads that one and leaves the others unread", async () => {
  const unread = async () =>
    (
      await sql("select count(*)::int as n from notifications where user_id = $1 and not is_read", [
        A.n,
      ])
    )[0].n;
  // Sent after the answers: the top-up and the booking
  for (let i = 0; i < 50 && (await unread()) < 2; i++) await a.page.waitForTimeout(100);
  const before = await unread();
  assert(before >= 2, `expected at least 2 unread notifications, got ${before}`);
  await a.page.goto(`${WEB}/dashboard`);
  await a.page.locator('button[aria-label^="Notifications"]:visible').first().click();
  await a.page.locator('[data-testid^="notification-"]').first().click();
  for (let i = 0; i < 50 && (await unread()) !== before - 1; i++) await a.page.waitForTimeout(100);
  equal(await unread(), before - 1, "unread after opening one");
});

await step(
  "the wallet brings older movements on demand, and its totals cover them all",
  async () => {
    // 34 more top-ups: 36 movements in all (20 + the spot + 34)
    for (let i = 0; i < 34; i++)
      equal((await credit(A, 1, `members-a-more-${i}`)).status, 200, `top-up ${i}`);
    await a.page.goto(`${WEB}/wallet`);
    const rows = a.page.getByTestId("wallet-history").locator("> li");
    await rows.first().waitFor({ timeout: 15000 });
    equal(await rows.count(), 30, "movements shown first");
    // 20 + 34 received, whatever the page shown
    await a.page.getByText("+54").waitFor();
    await a.page.getByTestId("btn-older-movements").click();
    await a.page.getByTestId("btn-older-movements").waitFor({ state: "hidden", timeout: 10000 });
    equal(await rows.count(), 36, "movements after asking for older ones");
  },
);

// ════════════════════════════════════════════════════════════════════════════
section("The desk blocks a member");
const desk = await as(ADMIN);

await step("blocked: the member is told on every page and the API is closed to them", async () => {
  await desk.page.goto(`${WEB}/admin/users`);
  await desk.page.getByTestId(`btn-block-${B.n}`).click();
  await desk.page.getByRole("alertdialog").getByRole("button", { name: "Bloquer" }).click();
  await desk.page.getByText("Membre bloqué").first().waitFor({ timeout: 10000 });
  await desk.page.getByTestId(`row-user-${B.n}`).getByText("Bloqué").waitFor();
  await shot(desk.page, "members-02-blocked");

  const b = await as(B);
  for (const route of ["/dashboard", "/terrains", "/boutique"]) {
    await b.page.goto(WEB + route);
    await b.page.getByTestId("account-blocked").waitFor({ timeout: 15000 });
  }
  await b.page.getByText("Votre compte est suspendu").waitFor();
  const refused = await api(B, "POST", "/reservations", {
    terrainId: 1,
    startTime: slot("09:30"),
    bookingMode: "own_spot",
  });
  equal(refused.status, 403, "booking while blocked");
  equal(refused.body.code, "ACCOUNT_BLOCKED", "code");
  await b.ctx.close();
});

await step("unblocked: the member is back in", async () => {
  await desk.page.getByTestId(`btn-block-${B.n}`).click();
  await desk.page.getByRole("alertdialog").getByRole("button", { name: "Débloquer" }).click();
  await desk.page.getByText("Membre débloqué").first().waitFor({ timeout: 10000 });
  const b = await as(B);
  await b.page.goto(`${WEB}/dashboard`);
  await b.page.getByRole("heading", { name: /Karim/ }).waitFor({ timeout: 15000 });
  equal(await b.page.getByTestId("account-blocked").count(), 0, "blocked screen");
  await b.ctx.close();
});

// ════════════════════════════════════════════════════════════════════════════
section("A member deletes their account");

await step("refused while a match is to come, in words the member understands", async () => {
  equal((await credit(C, 4, "members-c-4")).status, 200, "tokens for C");
  const booking = await api(C, "POST", "/reservations", {
    terrainId: 2,
    startTime: slot("11:00"),
    bookingMode: "full_court",
  });
  equal(booking.status, 201, "C's booking");
  const c = await as(C);
  await c.page.goto(`${WEB}/profile`);
  await c.page.getByTestId("btn-delete-account").click();
  const dialog = c.page.getByRole("dialog");
  await dialog.getByTestId("check-delete-account").check();
  await dialog.getByTestId("btn-confirm-delete-account").click();
  await dialog
    .getByRole("alert")
    .getByText(/matchs à venir/)
    .waitFor({ timeout: 10000 });
  equal(
    (await sql("select deleted_at from users where id = $1", [C.n]))[0].deleted_at,
    null,
    "account still there",
  );
  // That refusal is the point of this step: it is not a problem of the page
  c.page.problems.length = 0;
  await c.ctx.close();
});

await step(
  "deleted: the tokens left are shown as lost, the member is signed out and gone",
  async () => {
    equal((await credit(D, 3, "members-d-3")).status, 200, "tokens for D");
    const d = await as(D);
    await d.page.goto(`${WEB}/profile`);
    await d.page.getByTestId("btn-delete-account").click();
    const dialog = d.page.getByRole("dialog");
    await dialog
      .getByTestId("delete-tokens-lost")
      .getByText(/Il vous reste 3 tokens/)
      .waitFor();
    const confirm = dialog.getByTestId("btn-confirm-delete-account");
    equal(await confirm.isDisabled(), true, "confirm before ticking the box");
    await dialog.getByTestId("check-delete-account").check();
    await shot(d.page, "members-03-delete-account");
    await confirm.click();
    await d.page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 15000 });
    // The visitor's home page, and a private page now asks to sign in
    await d.page.getByRole("heading", { name: /Un terrain libre/ }).waitFor({ timeout: 15000 });
    await d.page.goto(`${WEB}/profile`);
    await d.page.waitForURL(/\/sign-in/, { timeout: 15000 });

    const [row] = await sql(
      "select email, first_name, phone, token_balance, deleted_at from users where id = $1",
      [D.n],
    );
    equal(row.email, `deleted-${D.n}@deleted.invalid`, "address");
    equal(row.first_name, null, "name");
    equal(row.token_balance, 0, "tokens");
    assert(row.deleted_at, "deleted_at is set");
    equal(
      (await sql("select id from auth.users where id = $1", [D.id])).length,
      0,
      "sign-in record",
    );
    // The session they still hold opens nothing
    equal((await api(D, "GET", "/users/me")).status, 401, "old session");
    await d.ctx.close();
    await desk.page.goto(`${WEB}/admin/users`);
    await desk.page.getByTestId(`row-user-${A.n}`).waitFor({ timeout: 15000 });
    equal(await desk.page.getByTestId(`row-user-${D.n}`).count(), 0, "deleted member listed");
  },
);

// ════════════════════════════════════════════════════════════════════════════
section("The desk closes the day's cash");

await step(
  "tokens sold and a spot paid at the club add up, and export to a spreadsheet",
  async () => {
    equal(
      (await credit(B, 10, "members-b-pack", { cashAmount: 250 })).status,
      200,
      "pack for cash",
    );
    const join = await api(B, "POST", `/reservations/${match.body.id}/join`, {
      paymentMethod: "cash_club",
    });
    equal(join.status, 201, "B's spot, to pay at the club");
    const [spot] = await sql(
      "select id from reservation_players where reservation_id = $1 and user_id = $2",
      [match.body.id, B.n],
    );
    equal(
      (
        await api(ADMIN, "PATCH", `/reservations/${match.body.id}/players/${spot.id}`, {
          paymentStatus: "paid",
        })
      ).status,
      200,
      "cash marked",
    );

    await desk.page.goto(`${WEB}/admin/cash`);
    const totals = desk.page.getByTestId("cash-totals");
    await totals.getByText("275").waitFor({ timeout: 15000 });
    await totals.getByText("250").first().waitFor();
    equal(await desk.page.locator("tbody tr").count(), 2, "lines of the day");
    await desk.page.getByText("Karim Belhadj").first().waitFor();
    await shot(desk.page, "members-04-cash");

    const [download] = await Promise.all([
      desk.page.waitForEvent("download"),
      desk.page.getByTestId("btn-export-cash").click(),
    ]);
    equal(download.suggestedFilename(), `caisse-${clubDay()}.csv`, "file name");
    const csv = readFileSync(await download.path(), "utf8");
    assert(csv.includes("Total espèces;275.00"), `total line missing in:\n${csv}`);
    assert(csv.includes("Karim Belhadj"), "member missing in the export");
    equal(csv.trim().split("\r\n").length, 4, "lines of the file (header, 2 payments, total)");

    // Another day holds nothing
    await desk.page.getByRole("button", { name: "Hier" }).click();
    await desk.page.getByText("Rien d'encaissé sur cette période.").waitFor({ timeout: 10000 });
  },
);

await step("the new screens fit a phone, and nothing went wrong behind the pages", async () => {
  const m = await as(ADMIN, { width: 375, height: 800 });
  await m.page.goto(`${WEB}/admin/cash`);
  await m.page.getByTestId("cash-totals").waitFor({ timeout: 15000 });
  equal(await overflow(m.page), 0, "cash report: sideways scroll");
  await m.ctx.close();
  const p = await as(A, { width: 375, height: 800 });
  await p.page.goto(`${WEB}/profile`);
  await p.page.getByTestId("btn-delete-account").click();
  const box = await p.page.getByRole("dialog").boundingBox();
  assert(box && box.x >= -1 && box.x + box.width <= 376, "delete dialog wider than the screen");
  equal(await overflow(p.page), 0, "profile: sideways scroll");
  await p.ctx.close();
  equal(
    [...a.page.problems, ...desk.page.problems].length,
    0,
    [...a.page.problems, ...desk.page.problems].slice(0, 4).join(" · "),
  );
});

await finish();
