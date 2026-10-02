/**
 * The club's business, end to end: tokens, the two ways to book, the calendar,
 * invitations, open matches, cancellations, the front desk, the admin's settings,
 * notifications and time zones. Actions are done in the browser like a member
 * would; the API and the database are then read to check what really happened.
 *
 * Yasmine = player A, Karim = B, Ines = C, Dalia = D (scripts/e2e/seed.sql).
 */
import {
  CRON_SECRET,
  API,
  USERS,
  WEB,
  api,
  as,
  assert,
  bookingCard,
  cell,
  clubDay,
  equal,
  finish,
  launch,
  openSlot,
  pickDay,
  section,
  shot,
  slot,
  sql,
  step,
} from "./lib.mjs";

await launch();
const { yasmine: A, karim: B, ines: C, dalia: D, admin: ADMIN } = USERS;

const balance = async (u) => (await api(u, "GET", "/users/me")).body.tokenBalance;
const history = async (u) => (await api(u, "GET", "/tokens/transactions?limit=100")).body.data;
const notifications = async (u) => (await api(u, "GET", "/notifications")).body;
const reservation = async (id) => (await api(ADMIN, "GET", `/reservations/${id}`)).body;
const upcoming = async (u) => (await api(u, "GET", "/reservations/upcoming")).body;
/** Notifications are sent after the response: wait for the one expected. */
async function waitForNotification(u, test, what) {
  for (let i = 0; i < 50; i++) {
    const found = (await notifications(u)).filter(test);
    if (found.length) return found;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`no notification: ${what}`);
}
const credit = (u, amount, key) =>
  api(ADMIN, "POST", "/tokens/admin/adjust", {
    userId: u.n,
    type: "credit",
    amount,
    description: "Recharge de test",
    idempotencyKey: key,
  });
const book = (u, court, hhmm, daysAhead, extra = {}) =>
  api(u, "POST", "/reservations", {
    terrainId: court,
    startTime: slot(hhmm, daysAhead),
    bookingMode: "full_court",
    ...extra,
  });

const a = await as(A);
const adminPage = await as(ADMIN);

// ════════════════════════════════════════════════════════════════════════════
section("Tokens");

await step("a new member starts at zero, with an empty history", async () => {
  await a.page.goto(`${WEB}/wallet`);
  await a.page.getByText("Votre solde").first().waitFor({ timeout: 15000 });
  equal(await balance(A), 0, "balance");
  equal((await history(A)).length, 0, "ledger entries");
  await a.page.getByText("Vos recharges et vos réservations apparaîtront ici.").waitFor();
});

await step(
  "the admin credits 10 tokens from the members page: exactly +10, once, signed",
  async () => {
    await adminPage.page.goto(`${WEB}/admin/users`);
    await adminPage.page.getByTestId(`btn-manage-tokens-${A.n}`).click();
    const dialog = adminPage.page.getByRole("dialog");
    await dialog.getByTestId("input-token-amount").fill("10");
    await dialog.getByRole("button", { name: /Recharge à l'accueil/ }).click();
    await dialog.getByTestId("btn-confirm-tokens").dblclick();
    await adminPage.page.getByRole("dialog").waitFor({ state: "hidden", timeout: 10000 });
    equal(await balance(A), 10, "balance after the credit");
    const tx = await history(A);
    equal(tx.length, 1, "ledger entries");
    equal(tx[0].type, "credit", "type");
    equal(tx[0].amount, 10, "amount");
    equal(tx[0].balanceAfter, 10, "balance after");
    equal(tx[0].adminId, ADMIN.n, "admin recorded");
    const [n] = await waitForNotification(A, (x) => x.type === "tokens_added", "tokens added");
    assert(/10/.test(`${n.title} ${n.message}`), `notification text: ${n.title} / ${n.message}`);
  },
);

await step("the member sees the credit in the wallet, and has no way to change it", async () => {
  await a.page.reload();
  await a.page.getByText("Recharge à l'accueil").first().waitFor({ timeout: 15000 });
  await shot(a.page, "acc-01-wallet");
  equal(
    await a.page.locator("main input, main textarea").count(),
    0,
    "editable fields in the wallet",
  );
  for (const [method, path, body] of [
    ["POST", "/tokens/admin/adjust", { userId: A.n, type: "credit", amount: 50, description: "x" }],
    ["POST", "/tokens/admin/adjust", { userId: B.n, type: "credit", amount: 50, description: "x" }],
    [
      "POST",
      "/tokens/admin/adjust",
      { userId: A.n, type: "adjustment", amount: 999, description: "x" },
    ],
    ["GET", "/tokens/admin/transactions", undefined],
    ["PATCH", `/users/${A.n}`, { tokenBalance: 999 }],
  ]) {
    const r = await api(A, method, path, body);
    equal(r.status, 403, `${method} ${path} as a player`);
  }
  equal(await balance(A), 10, "balance after the attempts");
  equal((await history(A)).length, 1, "ledger entries after the attempts");
});

// ════════════════════════════════════════════════════════════════════════════
section("Booking");

let ownSpot;
await step("“just my spot” on a free slot costs 1 token and leaves 3 spots open", async () => {
  await a.page.goto(`${WEB}/terrains`);
  const dialog = await openSlot(a.page, "Court Central", "18:30");
  await dialog.getByRole("radio", { name: /Juste ma place/ }).click();
  await dialog.getByText("1 place (la vôtre)").waitFor();
  await dialog.getByText("25 TND").first().waitFor();
  await dialog.getByRole("button", { name: "Confirmer la réservation" }).click();
  await dialog.getByText("Réservation confirmée").waitFor({ timeout: 10000 });
  await dialog.getByText(/1 token débité/).waitFor();
  await shot(a.page, "acc-02-own-spot-booked");
  equal(await balance(A), 9, "balance");
  [ownSpot] = await upcoming(A);
  equal(ownSpot.bookingMode, "own_spot", "booking mode");
  equal(ownSpot.totalSpots, 4, "spots");
  equal(ownSpot.players.length, 1, "players");
  equal(ownSpot.tokensCharged, 1, "tokens charged");
  equal(ownSpot.terrain.name, "Court Central", "court");
  equal(ownSpot.startTime, slot("18:30"), "start");
  equal(new Date(ownSpot.endTime) - new Date(ownSpot.startTime), 90 * 60e3, "duration");
  const debits = (await history(A)).filter((t) => t.type === "debit");
  equal(debits.length, 1, "debits");
  equal(debits[0].amount, 1, "debit amount");
  equal(debits[0].reservationId, ownSpot.id, "debit linked to the booking");
  equal(debits[0].balanceAfter, 9, "balance after the debit");
});

let fullCourt;
await step("a full court costs 4 tokens and holds the 4 spots", async () => {
  await a.page.goto(`${WEB}/terrains`);
  const dialog = await openSlot(a.page, "Court 2", "18:30");
  await dialog.getByRole("radio", { name: /Terrain complet/ }).waitFor();
  await dialog.getByText("4 places (vous + 3 invités)").waitFor();
  await dialog.getByText("100 TND").first().waitFor();
  await dialog.getByRole("button", { name: "Confirmer la réservation" }).click();
  await dialog.getByText("Réservation confirmée").waitFor({ timeout: 10000 });
  equal(await balance(A), 5, "balance");
  fullCourt = (await upcoming(A)).find((r) => r.bookingMode === "full_court");
  equal(fullCourt.totalSpots, 4, "spots");
  equal(fullCourt.tokensCharged, 4, "tokens charged");
  equal(fullCourt.userId, A.n, "booker");
  equal(fullCourt.players.length, 1, "players at booking");
  equal(fullCourt.players[0].paymentType, "token", "payment type");
  equal(fullCourt.players[0].paymentStatus, "paid", "payment status");
  equal(
    (await history(A)).filter((t) => t.reservationId === fullCourt.id).length,
    1,
    "debits for it",
  );
});

await step("the wallet lists both debits in the member's language, with a date", async () => {
  await a.page.goto(`${WEB}/wallet`);
  await a.page.getByText(/^Terrain complet · Court 2 · \d{2}\/\d{2}\/\d{4} 18:30$/).waitFor();
  await a.page.getByText(/^Ma place · Court Central · \d{2}\/\d{2}\/\d{4} 18:30$/).waitFor();
  equal(await a.page.getByText(/Full court|Own spot/).count(), 0, "English ledger wording");
});

await step("without enough tokens the booking is refused before and after the click", async () => {
  const b = await as(B);
  await b.page.goto(`${WEB}/terrains`);
  const dialog = await openSlot(b.page, "Court 3", "18:30");
  await dialog
    .getByRole("alert")
    .getByText(/Il manque 4 tokens/)
    .waitFor({ timeout: 10000 });
  assert(
    await dialog.getByRole("button", { name: "Confirmer la réservation" }).isDisabled(),
    "confirm enabled without tokens",
  );
  await shot(b.page, "acc-03-insufficient");
  await b.ctx.close();
  for (const mode of ["full_court", "own_spot"]) {
    const r = await book(B, 3, "18:30", 1, { bookingMode: mode });
    equal(r.status, 400, `status (${mode})`);
    equal(r.body.code, "INSUFFICIENT_TOKENS", `code (${mode})`);
  }
  equal(await balance(B), 0, "balance");
  equal((await history(B)).length, 0, "ledger entries");
  equal((await upcoming(B)).length, 0, "bookings left behind");
  const rows = await sql(
    "select count(*)::int as n from reservations where terrain_id = 3 and start_time = $1",
    [slot("18:30")],
  );
  equal(rows[0].n, 0, "rows for the refused slot");
});

await step("a taken slot can't be booked again: not on the grid, not by request", async () => {
  await credit(B, 8, "acc-b-8");
  const b = await as(B);
  await b.page.goto(`${WEB}/terrains`);
  const dialog = await openSlot(b.page, "Court 2", "18:30");
  await dialog.getByText("Terrain complet réservé").waitFor({ timeout: 10000 });
  equal(
    await dialog.getByRole("button", { name: "Confirmer la réservation" }).count(),
    0,
    "confirm buttons",
  );
  await b.ctx.close();
  const again = await book(B, 2, "18:30", 1);
  equal(again.status, 409, "second booking");
  equal(again.body.code, "SLOT_TAKEN", "code");
  equal(await balance(B), 8, "balance after the refusal");
});

await step("times inside a match are not slots; the next slot starts when it ends", async () => {
  for (const hhmm of ["19:00", "19:30", "18:00", "18:31"]) {
    const r = await book(B, 2, hhmm, 1);
    equal(r.status, 400, `booking at ${hhmm}`);
    equal(r.body.code, "INVALID_SLOT", `code at ${hhmm}`);
  }
  const next = await book(B, 2, "20:00", 1);
  equal(next.status, 201, "20:00, right after the 18:30 match");
  equal(await balance(B), 4, "balance");
  equal((await api(B, "POST", `/reservations/${next.body.id}/cancel`)).status, 200, "cancel");
  equal(await balance(B), 8, "balance after the refund");
});

await step("two members on the same slot at the same instant: one books, one is told", async () => {
  await credit(D, 4, "acc-d-4");
  const before = { A: await balance(A), D: await balance(D) };
  const [ra, rd] = await Promise.all([book(A, 2, "20:00", 2), book(D, 2, "20:00", 2)]);
  const statuses = [ra.status, rd.status].sort();
  equal(JSON.stringify(statuses), "[201,409]", "statuses");
  const loser = ra.status === 409 ? ra : rd;
  equal(loser.body.code, "SLOT_TAKEN", "loser's code");
  const rows = await sql(
    "select id, user_id from reservations where terrain_id = 2 and start_time = $1",
    [slot("20:00", 2)],
  );
  equal(rows.length, 1, "bookings for the slot");
  const winner = rows[0].user_id === A.n ? A : D;
  const other = winner === A ? D : A;
  equal(await balance(winner), before[winner === A ? "A" : "D"] - 4, "winner's balance");
  equal(await balance(other), before[other === A ? "A" : "D"], "loser's balance");
  const debits = await sql(
    "select count(*)::int as n from token_transactions where reservation_id = $1",
    [rows[0].id],
  );
  equal(debits[0].n, 1, "debits for the slot");
  await waitForNotification(
    winner,
    (n) => n.type === "booking_confirmed" && /20:00/.test(n.message),
    "winner",
  );
  const loserNotes = (await notifications(other)).filter(
    (n) =>
      n.type === "booking_confirmed" &&
      new RegExp(clubDay(2).slice(8)).test(n.message) &&
      /20:00/.test(n.message),
  );
  equal(loserNotes.length, 0, "confirmations sent to the loser");
  equal((await api(winner, "POST", `/reservations/${rows[0].id}/cancel`)).status, 200, "cleanup");
});

await step(
  "two browsers confirming the same slot together: one success screen, one clear refusal",
  async () => {
    const d = await as(D);
    const b = await as(B);
    await Promise.all([d.page.goto(`${WEB}/terrains`), b.page.goto(`${WEB}/terrains`)]);
    const [dd, bd] = [
      await openSlot(d.page, "Court 4", "11:00", 2),
      await openSlot(b.page, "Court 4", "11:00", 2),
    ];
    const confirm = (dlg) => dlg.getByRole("button", { name: "Confirmer la réservation" });
    await Promise.all([confirm(dd).waitFor(), confirm(bd).waitFor()]);
    await Promise.all([confirm(dd).click(), confirm(bd).click()]);
    const outcome = (page) =>
      Promise.race([
        page
          .getByText("Réservation confirmée")
          .waitFor({ timeout: 10000 })
          .then(() => "booked"),
        page
          .getByText("Ce terrain vient d'être réservé")
          .first()
          .waitFor({ timeout: 10000 })
          .then(() => "refused"),
      ]);
    const outcomes = [await outcome(d.page), await outcome(b.page)].sort();
    equal(JSON.stringify(outcomes), '["booked","refused"]', "what the two members saw");
    const rows = await sql(
      "select id from reservations where terrain_id = 4 and start_time = $1 and status = 'confirmed'",
      [slot("11:00", 2)],
    );
    equal(rows.length, 1, "bookings for the slot");
    await api(ADMIN, "POST", `/reservations/${rows[0].id}/cancel`);
    await d.ctx.close();
    await b.ctx.close();
  },
);

// ════════════════════════════════════════════════════════════════════════════
section("Calendar");

await step("the planning shows each slot as the viewer should see it", async () => {
  await a.page.goto(`${WEB}/terrains`);
  await openSlot(a.page, "Court Central", "18:30");
  const mine = a.page.getByRole("dialog");
  await mine.getByText("Vous jouez").waitFor({ timeout: 10000 });
  await a.page.keyboard.press("Escape");
  await mine.waitFor({ state: "hidden", timeout: 5000 });
  const label = (page, court, time) =>
    cell(page, court, time).getAttribute("aria-label", { timeout: 10000 });
  assert(/Mon match/.test(await label(a.page, "Court Central", "18:30")), "own match not marked");
  assert(/Mon match/.test(await label(a.page, "Court 2", "18:30")), "own full court not marked");
  assert(/Libre/.test(await label(a.page, "Court 3", "18:30")), "free slot not marked free");
  await shot(a.page, "acc-04-planning-mine");
  const v = await as(null);
  await v.page.goto(`${WEB}/terrains`);
  await pickDay(v.page, 1);
  assert(
    /Complet/.test(await label(v.page, "Court 2", "18:30")),
    "full court not shown full to a visitor",
  );
  assert(
    /3 places/.test(await label(v.page, "Court Central", "18:30")),
    "open spots not shown to a visitor",
  );
  const body = await v.page.locator("main").innerText();
  assert(
    !/yasmine@test\.tn|Ben Ali/.test(body),
    "a member's contact details are shown to a visitor",
  );
  await v.ctx.close();
});

await step(
  "day and court-type navigation change what is listed, on desktop and mobile",
  async () => {
    await a.page.keyboard.press("Escape");
    await a.page.goto(`${WEB}/terrains`);
    await a.page.getByRole("columnheader", { name: /Court Central/ }).waitFor({ timeout: 15000 });
    const courts = async (page) =>
      (await page.getByRole("columnheader").allInnerTexts()).filter((h) => /Court/.test(h)).length;
    equal(await courts(a.page), 4, "courts listed");
    await a.page.getByRole("button", { name: "Indoor" }).click();
    await a.page
      .getByRole("columnheader", { name: /Court 3/ })
      .waitFor({ state: "hidden", timeout: 5000 });
    equal(await courts(a.page), 2, "indoor courts");
    await a.page.getByRole("button", { name: "Outdoor" }).click();
    await a.page.getByRole("columnheader", { name: /Court 3/ }).waitFor({ timeout: 5000 });
    equal(await courts(a.page), 2, "outdoor courts");
    await a.page.getByRole("button", { name: "Tous" }).click();
    const days = await a.page.getByRole("group", { name: "Jour" }).getByRole("button").count();
    assert(days >= 7, `days offered: ${days}`);
    const m = await as(A, { width: 390, height: 844 });
    await m.page.goto(`${WEB}/terrains`);
    await m.page.getByRole("columnheader", { name: /Court Central/ }).waitFor({ timeout: 15000 });
    const scroller = m.page.getByRole("columnheader", { name: /Court 4/ });
    await scroller.scrollIntoViewIfNeeded();
    assert(await scroller.isVisible(), "the last court can't be reached on a phone");
    assert(
      await m.page.getByRole("rowheader").first().isVisible(),
      "times scrolled away with the courts",
    );
    await m.ctx.close();
  },
);

// ════════════════════════════════════════════════════════════════════════════
section("Invitations");

let inviteToC;
await step("the booker invites a member; the invitation names who, where and when", async () => {
  await a.page.goto(`${WEB}/reservations`);
  const card = bookingCard(a.page, "Court 2");
  await card.getByRole("button", { name: "Inviter" }).click({ timeout: 15000 });
  await a.page.getByPlaceholder("Nom ou e-mail exact").fill("Karim");
  await a.page.getByText("Karim B.").waitFor({ timeout: 10000 });
  await a.page
    .getByRole("listitem")
    .filter({ hasText: /^Karim B\./ })
    .getByRole("button", { name: "Inviter" })
    .dblclick();
  await a.page
    .getByRole("listitem")
    .filter({ hasText: /^Karim B\./ })
    .getByText("Invité")
    .waitFor({ timeout: 10000 });
  await shot(a.page, "acc-05a-invite-member");
  const [note] = await waitForNotification(
    B,
    (n) => n.type === "invitation",
    "invitation for Karim",
  );
  const text = `${note.title} ${note.message}`;
  assert(/Yasmine/.test(text), `inviter missing: ${text}`);
  assert(/Court 2/.test(text), `court missing: ${text}`);
  assert(/18:30/.test(text), `time missing: ${text}`);
  const invites = (await api(B, "GET", "/invites")).body;
  equal(invites.length, 1, "pending invitations");
  equal(invites[0].invitedBy, "Yasmine B.", "inviter shown");
  equal(invites[0].reservation.terrainName, "Court 2", "court");
  equal(invites[0].reservation.startTime, slot("18:30"), "start");
  equal(invites[0].reservation.free, true, "spot already paid");
});

await step("the invited member accepts from the dashboard and plays for free", async () => {
  const before = await balance(B);
  const b = await as(B, { width: 390, height: 844 });
  await b.page.goto(`${WEB}/dashboard`);
  await b.page.getByText("1 invitation à un match").waitFor({ timeout: 15000 });
  await b.page.getByText("Yasmine B. vous invite").waitFor();
  await shot(b.page, "acc-05-invitation-mobile");
  await b.page.getByRole("link", { name: "Voir et accepter" }).click();
  await b.page
    .getByText(/votre place est offerte/)
    .first()
    .waitFor({ timeout: 15000 });
  await b.page.getByRole("button", { name: "Rejoindre le match" }).click();
  await b.page.waitForURL(/\/reservations/, { timeout: 15000 });
  await b.page.getByText("Invité").first().waitFor({ timeout: 10000 });
  equal(await balance(B), before, "invited member's balance");
  const r = await reservation(fullCourt.id);
  equal(r.players.length, 2, "players");
  const row = r.players.find((p) => p.userId === B.n);
  equal(row.paymentType, "invited_free", "payment type");
  equal(row.tokensCharged, 0, "tokens charged");
  equal((await api(B, "GET", "/invites")).body.length, 0, "pending invitations left");
  await b.ctx.close();
});

await step("the booker sees the new player on the reservation", async () => {
  await a.page.goto(`${WEB}/reservations`);
  await a.page.getByText("Karim B.").first().waitFor({ timeout: 15000 });
  await shot(a.page, "acc-06-reservation-with-player");
});

await step(
  "the same member can't be invited twice, and only one notification goes out",
  async () => {
    const first = await api(A, "POST", `/reservations/${fullCourt.id}/invite`, { userId: C.n });
    equal(first.status, 201, "first invitation");
    inviteToC = first.body.token;
    const second = await api(A, "POST", `/reservations/${fullCourt.id}/invite`, { userId: C.n });
    equal(second.status, 409, "second invitation");
    equal(second.body.code, "ALREADY_INVITED", "code");
    const again = await api(A, "POST", `/reservations/${fullCourt.id}/invite`, { userId: B.n });
    equal(again.status, 409, "inviting a member who already plays");
    equal(again.body.code, "ALREADY_JOINED", "code");
    await waitForNotification(C, (n) => n.type === "invitation", "invitation for Ines");
    await new Promise((r) => setTimeout(r, 300));
    equal(
      (await notifications(C)).filter((n) => n.type === "invitation").length,
      1,
      "notifications",
    );
    equal((await api(C, "GET", "/invites")).body.length, 1, "pending invitations");
  },
);

await step("declining removes the invitation and adds nobody", async () => {
  const c = await as(C);
  await c.page.goto(`${WEB}/dashboard`);
  await c.page.getByText("1 invitation à un match").waitFor({ timeout: 15000 });
  await c.page.getByRole("button", { name: "Refuser" }).first().click();
  await c.page.getByText(/invitation à un match/).waitFor({ state: "hidden", timeout: 10000 });
  await c.ctx.close();
  const r = await reservation(fullCourt.id);
  equal(r.players.length, 2, "players");
  assert(!r.players.some((p) => p.userId === C.n), "the member who declined is in the match");
  const reuse = await api(C, "POST", `/invites/${inviteToC}/accept`);
  equal(reuse.status, 410, "accepting a declined invitation");
  equal(reuse.body.code, "INVITE_DECLINED", "code");
});

await step("an invitation is personal: nobody else can use or decline it", async () => {
  const personal = await api(A, "POST", `/reservations/${fullCourt.id}/invite`, { userId: C.n });
  equal(personal.status, 201, "new invitation after a decline");
  const stolen = await api(D, "POST", `/invites/${personal.body.token}/accept`);
  equal(stolen.status, 403, "accepted by another member");
  const declined = await api(D, "POST", `/invites/${personal.body.token}/decline`);
  equal(declined.status, 403, "declined by another member");
  equal((await api(D, "GET", "/invites")).body.length, 0, "invitations another member sees");
  equal(
    (await api(B, "POST", `/reservations/${fullCourt.id}/invite`, {})).status,
    403,
    "a guest inviting",
  );
  equal(
    (await api(C, "POST", `/invites/${personal.body.token}/accept`)).status,
    201,
    "accepted by its owner",
  );
});

await step("a full match takes no more players and no more invitations", async () => {
  const link = (await api(A, "POST", `/reservations/${fullCourt.id}/invite`, {})).body.token;
  equal((await api(D, "POST", `/invites/${link}/accept`)).status, 201, "4th player");
  equal((await reservation(fullCourt.id)).players.length, 4, "players");
  const fifth = await api(ADMIN, "POST", `/invites/${link}/accept`);
  equal(fifth.status, 409, "5th player");
  equal(fifth.body.code, "MATCH_FULL", "code");
  const page = await as(ADMIN, { width: 390, height: 844 });
  await page.page.goto(`${WEB}/join/${link}`);
  await page.page.getByText("Match complet").first().waitFor({ timeout: 15000 });
  await shot(page.page, "acc-07-match-full-mobile");
  await page.ctx.close();
  equal((await reservation(fullCourt.id)).players.length, 4, "players after the refusal");
  equal(await balance(A), 5, "the booker paid once");
  const invalid = await api(B, "POST", "/invites/not-a-real-token-000000/accept");
  equal(invalid.status, 404, "made-up invitation");
});

// ════════════════════════════════════════════════════════════════════════════
section("Open matches");

let open;
await step("an open match is listed for the club with its free spots", async () => {
  const r = await book(A, 3, "17:00", 1, {
    bookingMode: "own_spot",
    isPublic: true,
    publicDescription: "Niveau 3, bonne humeur",
  });
  equal(r.status, 201, "open match");
  open = r.body;
  equal(await balance(A), 4, "organiser's balance");
  const b = await as(B);
  await b.page.goto(`${WEB}/open-matches`);
  await b.page.getByText("Niveau 3, bonne humeur").waitFor({ timeout: 15000 });
  await shot(b.page, "acc-08-open-matches");
  const before = await balance(B);
  await b.page
    .getByRole("button", { name: /Rejoindre · 1 token/ })
    .first()
    .dblclick();
  await b.page.getByText("Vous êtes dans le match !").first().waitFor({ timeout: 10000 });
  equal(await balance(B), before - 1, "balance after joining (double click)");
  const rows = (await reservation(open.id)).players;
  equal(rows.length, 2, "players");
  equal(rows.filter((p) => p.userId === B.n).length, 1, "rows for the member who joined");
  await b.ctx.close();
});

await step("the last spot goes to one member; a full match leaves the list", async () => {
  equal(
    (await api(C, "POST", `/reservations/${open.id}/join`, { paymentMethod: "cash_club" })).status,
    201,
    "3rd player (cash)",
  );
  await credit(ADMIN, 2, "acc-admin-2");
  const [d, e] = await Promise.all([
    api(D, "POST", `/reservations/${open.id}/join`, {}),
    api(ADMIN, "POST", `/reservations/${open.id}/join`, {}),
  ]);
  equal(JSON.stringify([d.status, e.status].sort()), "[201,409]", "two members on the last spot");
  equal((d.status === 409 ? d : e).body.code, "MATCH_FULL", "code");
  equal((await reservation(open.id)).players.length, 4, "players");
  const refused = d.status === 409 ? D : ADMIN;
  equal(
    (await history(refused)).filter((t) => t.reservationId === open.id).length,
    0,
    "debits of the refused member",
  );
  const list = (await api(B, "GET", "/open-matches")).body;
  assert(!list.some((m) => m.reservationId === open.id), "a full match is still offered");
  equal((await api(B, "POST", `/reservations/${open.id}/join`, {})).status, 409, "joining twice");
});

await step("leaving frees the spot and refunds the token, once", async () => {
  const before = await balance(B);
  const b = await as(B);
  await b.page.goto(`${WEB}/reservations`);
  const leave = b.page.getByRole("button", { name: "Quitter" });
  await leave.first().waitFor({ timeout: 15000 });
  await leave.first().dblclick();
  await b.page.getByText("Vous avez quitté le match").first().waitFor({ timeout: 10000 });
  await b.ctx.close();
  equal(await balance(B), before + 1, "balance after leaving");
  const r = await reservation(open.id);
  equal(r.players.length, 3, "players");
  equal(
    (await history(B)).filter((t) => t.reservationId === open.id && t.type === "credit").length,
    1,
    "refunds",
  );
  const list = (await api(B, "GET", "/open-matches")).body;
  equal(list.find((m) => m.reservationId === open.id)?.openSpots, 1, "open spots after leaving");
  equal((await api(B, "DELETE", `/reservations/${open.id}/leave`)).status, 404, "leaving twice");
});

// ════════════════════════════════════════════════════════════════════════════
section("Front desk: cash and mixed payments");
// The rest of the journey is about rules, not balances: nobody should run out of tokens
for (const u of [A, B, D]) await credit(u, 40, `acc-topup-${u.n}`);

await step("one match, four ways to pay: each player's state is exact", async () => {
  const before = { B: await balance(B), C: await balance(C), D: await balance(D) };
  const r = await reservation(open.id);
  // A token (organiser), C cash pending, last-spot winner token; fill the 4th by the desk
  const add = await api(ADMIN, "POST", `/reservations/${open.id}/players`, {
    userId: B.n,
    paymentType: "cash_club",
  });
  equal(add.status, 201, "desk adds a member, to pay in cash");
  const now = await reservation(open.id);
  equal(now.players.length, 4, "players");
  const state = (u) => {
    const p = now.players.find((x) => x.userId === u.n);
    return p ? `${p.paymentType}/${p.paymentStatus}/${p.tokensCharged}` : "absent";
  };
  equal(state(A), "token/paid/1", "organiser");
  equal(state(C), "cash_club/pending/0", "cash, not yet received");
  equal(state(B), "cash_club/pending/0", "added by the desk");
  equal(await balance(B), before.B, "balance of the member added in cash");
  equal(await balance(C), before.C, "balance of the cash payer");
  assert(r.players.length === 3, "setup");
});

await step("the admin sees every payment on the planning and cashes one in", async () => {
  await adminPage.page.goto(`${WEB}/admin/reservations`);
  const dialog = await openSlot(adminPage.page, "Court 3", "17:00");
  await dialog.getByText("À payer au club").first().waitFor({ timeout: 10000 });
  equal(await dialog.getByText("À payer au club").count(), 2, "unpaid cash spots shown");
  assert((await dialog.getByText("Payé · token").count()) >= 2, "token spots not shown");
  await dialog.getByText("Yasmine Ben Ali").waitFor();
  await shot(adminPage.page, "acc-09-admin-mixed-payments");
  await dialog.getByRole("button", { name: "Encaisser" }).first().dblclick();
  await dialog.getByText("Espèces · payé").waitFor({ timeout: 10000 });
  await adminPage.page.keyboard.press("Escape");
  const r = await reservation(open.id);
  equal(
    r.players.filter((p) => p.paymentType === "cash_club" && p.paymentStatus === "paid").length,
    1,
    "cash received",
  );
  equal(
    r.players.filter((p) => p.paymentType === "cash_club" && p.paymentStatus === "pending").length,
    1,
    "cash pending",
  );
  const log = await sql(
    "select count(*)::int as n from activity where type = 'payment_updated' and user_id is not null",
  );
  equal(log[0].n, 1, "audit entries for the cash");
  const tokenSpot = r.players.find((p) => p.paymentType === "token");
  const edit = await api(ADMIN, "PATCH", `/reservations/${open.id}/players/${tokenSpot.id}`, {
    paymentStatus: "pending",
  });
  equal(edit.status, 400, "editing a token payment by hand");
});

await step(
  "a phone booking for a guest is on the planning, signed by the admin, without tokens",
  async () => {
    await adminPage.page.goto(`${WEB}/admin/reservations`);
    await adminPage.page.getByTestId("btn-create-reservation").click();
    const dialog = adminPage.page.getByRole("dialog");
    await dialog.getByTestId("select-terrain").click();
    await adminPage.page.getByRole("option", { name: "Court 4" }).click();
    const slots = adminPage.page.waitForResponse((r) =>
      r.url().includes(`/api/calendar?date=${clubDay(1)}`),
    );
    await dialog.locator("#nb-date").fill(clubDay(1));
    await slots;
    await dialog.getByRole("radio", { name: "14:00" }).click();
    await dialog.getByTestId("input-guest-name").fill("Sami (téléphone)");
    await dialog.locator("#nb-phone").fill("+216 22 111 222");
    await dialog.getByTestId("btn-confirm-booking").dblclick();
    await adminPage.page.getByText("Réservation créée").first().waitFor({ timeout: 10000 });
    const rows = await sql(
      "select id, user_id, guest_name, guest_phone, booking_type, tokens_charged from reservations where terrain_id = 4 and start_time = $1",
      [slot("14:00")],
    );
    equal(rows.length, 1, "bookings created by the double click");
    equal(rows[0].user_id, null, "member");
    equal(rows[0].guest_name, "Sami (téléphone)", "guest");
    equal(rows[0].booking_type, "phone", "channel");
    equal(rows[0].tokens_charged, 0, "tokens");
    const log = await sql(
      "select message from activity where type = 'reservation_created' order by id desc limit 1",
    );
    assert(/by Club Owner/.test(log[0].message), `audit: ${log[0].message}`);
    const seen = await api(A, "GET", `/calendar?date=${clubDay(1)}`);
    const text = JSON.stringify(seen.body);
    assert(!/22 111 222|Sami/.test(text), "a guest's name or phone is shown to a member");
  },
);

// ════════════════════════════════════════════════════════════════════════════
section("Cancellations");

await step("the booker cancels in time: tokens back, slot free, everyone told once", async () => {
  const r = await book(A, 4, "20:00", 1);
  equal(r.status, 201, "booking");
  const before = await balance(A);
  await a.page.goto(`${WEB}/reservations`);
  await bookingCard(a.page, "Court 4")
    .getByRole("button", { name: "Annuler" })
    .click({ timeout: 15000 });
  const confirm = a.page.getByRole("alertdialog");
  await confirm.getByText("Annuler ce match ?").waitFor({ timeout: 10000 });
  await confirm.getByText(/seront remboursés/).waitFor();
  await confirm.getByRole("button", { name: "Annuler le match" }).dblclick();
  await a.page.getByText("Réservation annulée").first().waitFor({ timeout: 10000 });
  equal(await balance(A), before + 4, "balance after the refund");
  const row = await reservation(r.body.id);
  equal(row.status, "cancelled", "status");
  equal(row.players[0].paymentStatus, "refunded", "player row");
  equal(
    (await history(A)).filter((t) => t.reservationId === r.body.id && t.type === "credit").length,
    1,
    "refunds",
  );
  const notes = await waitForNotification(
    A,
    (n) => n.type === "booking_cancelled" && /Court 4/.test(`${n.title} ${n.message}`),
    "cancellation",
  );
  equal(notes.length, 1, "cancellation notifications");
  equal(
    (await api(A, "POST", `/reservations/${r.body.id}/cancel`)).body.code,
    "ALREADY_CANCELLED",
    "cancelling twice",
  );
  const again = await book(D, 4, "20:00", 1);
  equal(again.status, 201, "the freed slot can be booked again");
  equal((await api(D, "POST", `/reservations/${again.body.id}/cancel`)).status, 200, "cleanup");
});

await step(
  "the cancellation deadline is enforced by the server, whatever the browser sends",
  async () => {
    const r = await book(A, 4, "21:30", 1);
    equal(r.status, 201, "booking");
    const before = await balance(A);
    let s = await api(ADMIN, "PATCH", "/admin/settings", {
      cancellationNoticeHours: 72,
      lateCancellation: "forbid",
    });
    equal(s.status, 200, "settings: 72 h, forbid");
    const refused = await api(A, "POST", `/reservations/${r.body.id}/cancel`, {
      force: true,
      refund: true,
    });
    equal(refused.status, 400, "late cancellation");
    equal(refused.body.code, "CANCELLATION_CLOSED", "code");
    equal((await reservation(r.body.id)).status, "confirmed", "status after the refusal");
    await a.page.goto(`${WEB}/reservations`);
    await bookingCard(a.page, "Court 4")
      .getByRole("button", { name: "Annuler" })
      .click({ timeout: 15000 });
    await a.page
      .getByRole("alertdialog")
      .getByText(/Appelez le club pour annuler/)
      .waitFor({ timeout: 10000 });
    equal(
      await a.page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Annuler le match" })
        .count(),
      0,
      "cancel button past the deadline",
    );
    await a.page.keyboard.press("Escape");
    s = await api(ADMIN, "PATCH", "/admin/settings", { lateCancellation: "no_refund" });
    equal(s.status, 200, "settings: no refund");
    const late = await api(A, "POST", `/reservations/${r.body.id}/cancel`);
    equal(late.status, 200, "late cancellation without refund");
    equal(late.body.refundForfeited, true, "refund forfeited");
    equal(await balance(A), before, "balance after a late cancellation");
    equal(
      (await api(ADMIN, "POST", "/admin/settings/reset", { section: "booking" })).status,
      200,
      "reset",
    );
  },
);

await step("the admin cancels a member's booking: refunded, recorded, notified", async () => {
  const r = await book(B, 4, "17:00", 1);
  equal(r.status, 201, "booking");
  const before = await balance(B);
  equal(
    (await api(A, "POST", `/reservations/${r.body.id}/cancel`)).status,
    403,
    "another member cancelling it",
  );
  await adminPage.page.goto(`${WEB}/admin/reservations`);
  await adminPage.page.getByRole("radio", { name: "Liste" }).click();
  await adminPage.page.getByTestId(`btn-cancel-${r.body.id}`).click({ timeout: 15000 });
  const confirm = adminPage.page.getByRole("alertdialog");
  await confirm.getByText("Annuler cette réservation ?").waitFor();
  await confirm.getByRole("button", { name: "Oui, annuler" }).dblclick();
  await adminPage.page.getByText("Réservation annulée").first().waitFor({ timeout: 10000 });
  await shot(adminPage.page, "acc-10-admin-cancelled");
  equal((await reservation(r.body.id)).status, "cancelled", "status");
  equal(await balance(B), before + 4, "balance after the refund");
  const refund = (await history(B)).find(
    (t) => t.reservationId === r.body.id && t.type === "credit",
  );
  equal(refund.adminId, ADMIN.n, "admin recorded on the refund");
  const log = await sql(
    "select message from activity where type = 'reservation_cancelled' order by id desc limit 1",
  );
  assert(/cancelled by Club Owner/.test(log[0].message), `audit: ${log[0].message}`);
  const notes = await waitForNotification(
    B,
    (n) => n.type === "booking_cancelled" && /Court 4/.test(`${n.title} ${n.message}`),
    "cancellation for the member",
  );
  equal(notes.length, 1, "notifications");
});

// ════════════════════════════════════════════════════════════════════════════
section("Courts, maintenance and opening hours");

let newCourt;
await step(
  "the admin adds, renames, closes and reopens a court; the planning follows",
  async () => {
    await adminPage.page.goto(`${WEB}/admin/terrains`);
    await adminPage.page.getByTestId("btn-create-terrain").click();
    const dialog = adminPage.page.getByRole("dialog");
    await dialog.getByTestId("input-terrain-name").fill("Court Test");
    await dialog.getByTestId("btn-save-terrain").click();
    await adminPage.page.getByText("Terrain ajouté").first().waitFor({ timeout: 10000 });
    newCourt = (await api(ADMIN, "GET", "/terrains")).body.find((t) => t.name === "Court Test");
    assert(newCourt, "court not created");
    await adminPage.page.getByTestId(`btn-edit-terrain-${newCourt.id}`).click();
    await dialog.getByTestId("input-terrain-name").fill("Court Panoramique");
    await dialog.getByTestId("btn-save-terrain").click();
    await adminPage.page.getByText("Terrain mis à jour").first().waitFor({ timeout: 10000 });
    await a.page.goto(`${WEB}/terrains`);
    await a.page
      .getByRole("columnheader", { name: /Court Panoramique/ })
      .waitFor({ timeout: 15000 });
    const saved = () =>
      adminPage.page.waitForResponse(
        (r) => r.url().includes(`/api/terrains/${newCourt.id}`) && r.request().method() === "PATCH",
      );
    let done = saved();
    await adminPage.page.getByTestId(`switch-terrain-${newCourt.id}`).click();
    equal((await done).status(), 200, "court closed");
    const closed = await book(A, newCourt.id, "08:00", 2);
    equal(closed.status, 400, "booking a closed court");
    equal(closed.body.code, "COURT_UNAVAILABLE", "code");
    await a.page.reload();
    await a.page.getByRole("columnheader", { name: /Court Central/ }).waitFor({ timeout: 15000 });
    equal(
      await a.page.getByRole("columnheader", { name: /Court Panoramique/ }).count(),
      0,
      "closed court on the planning",
    );
    done = saved();
    await adminPage.page.getByTestId(`switch-terrain-${newCourt.id}`).click();
    equal((await done).status(), 200, "court reopened");
    await a.page.reload();
    await a.page
      .getByRole("columnheader", { name: /Court Panoramique/ })
      .waitFor({ timeout: 15000 });
    await shot(adminPage.page, "acc-11-admin-courts");
  },
);

await step("a court in maintenance can't be booked by anyone until it is back", async () => {
  await adminPage.page.getByTestId(`btn-edit-terrain-${newCourt.id}`).click();
  const dialog = adminPage.page.getByRole("dialog");
  await dialog.getByTestId("switch-maintenance").click();
  const saved = adminPage.page.waitForResponse(
    (x) => x.url().includes(`/api/terrains/${newCourt.id}`) && x.request().method() === "PATCH",
  );
  await dialog.getByTestId("btn-save-terrain").click();
  equal((await saved).status(), 200, "maintenance saved");
  const r = await book(A, newCourt.id, "08:00", 2);
  equal(r.status, 400, "booking a court in maintenance");
  equal(r.body.code, "COURT_MAINTENANCE", "code");
  await a.page.reload();
  await a.page
    .getByRole("columnheader", { name: /Court Panoramique/ })
    .getByText("Maintenance")
    .waitFor({ timeout: 15000 });
  equal(
    (await api(ADMIN, "PATCH", `/terrains/${newCourt.id}`, { isMaintenance: false })).status,
    200,
    "end of maintenance",
  );
  const ok = await book(A, newCourt.id, "08:00", 2);
  equal(ok.status, 201, "booking once it is back");
  equal((await api(A, "POST", `/reservations/${ok.body.id}/cancel`)).status, 200, "cleanup");
});

await step(
  "a blocked slot is unavailable to players and can be released by the admin",
  async () => {
    await adminPage.page.goto(`${WEB}/admin/reservations`);
    const dialog = await openSlot(adminPage.page, "Court 3", "11:00", 2);
    await dialog.getByRole("button", { name: /Bloquer ce créneau/ }).click();
    await adminPage.page.getByText("Créneau bloqué").first().waitFor({ timeout: 10000 });
    const refused = await book(A, 3, "11:00", 2);
    equal(refused.status, 409, "booking a blocked slot");
    await a.page.goto(`${WEB}/terrains`);
    await pickDay(a.page, 2);
    const state = await cell(a.page, "Court 3", "11:00").getAttribute("aria-label", {
      timeout: 10000,
    });
    assert(/Fermé|Indispo/.test(state), `blocked slot shown to a player as: ${state}`);
    await cell(a.page, "Court 3", "11:00").click();
    equal(
      await a.page.getByRole("button", { name: "Confirmer la réservation" }).count(),
      0,
      "booking form on a blocked slot",
    );
    await a.page.keyboard.press("Escape");
    const again = await openSlot(adminPage.page, "Court 3", "11:00", 2);
    await again.getByRole("button", { name: "Débloquer" }).click();
    await again.getByRole("button", { name: "Confirmer l'annulation" }).click();
    await adminPage.page.getByText("Réservation annulée").first().waitFor({ timeout: 10000 });
    const ok = await book(A, 3, "11:00", 2);
    equal(ok.status, 201, "booking after the release");
    equal((await api(A, "POST", `/reservations/${ok.body.id}/cancel`)).status, 200, "cleanup");
  },
);

await step("opening hours and closed days decide what can be booked", async () => {
  const week = (patch) =>
    api(ADMIN, "PUT", "/admin/opening-hours", {
      days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        isClosed: false,
        openTime: "08:00",
        closeTime: "23:00",
        ...(patch[weekday] ?? {}),
      })),
    });
  equal((await week({})).status, 200, "hours 08:00 to 23:00");
  const early = await book(A, 3, "07:00", 3);
  equal(early.status, 400, "07:00, before opening");
  equal(early.body.code, "OUTSIDE_OPENING_HOURS", "code");
  const lateSlot = await book(A, 3, "23:00", 3);
  equal(lateSlot.status, 400, "23:00, at closing");
  const morning = await book(A, 3, "09:30", 3);
  equal(morning.status, 201, "09:30, inside the hours");
  equal((await api(A, "POST", `/reservations/${morning.body.id}/cancel`)).status, 200, "cleanup");

  const day = clubDay(4);
  const weekday = new Date(`${day}T12:00:00+01:00`).getUTCDay();
  equal((await week({ [weekday]: { isClosed: true } })).status, 200, "one weekday closed");
  const closed = await book(A, 3, "09:30", 4);
  equal(closed.status, 400, "booking on the closed day");
  equal(closed.body.code, "CLUB_CLOSED", "code");
  await a.page.goto(`${WEB}/terrains`);
  await a.page.getByRole("group", { name: "Jour" }).getByRole("button").nth(4).click();
  await a.page.getByText("Club fermé ce jour-là").waitFor({ timeout: 10000 });
  await shot(a.page, "acc-12-closed-day");
  equal(
    (await api(ADMIN, "POST", "/admin/settings/reset", { section: "openingHours" })).status,
    200,
    "reset",
  );
  equal((await book(A, 3, "07:00", 3)).body.code, "OUTSIDE_OPENING_HOURS", "07:00 after the reset");
});

await step("a new price applies to new bookings and leaves past ones untouched", async () => {
  const beforeLedger = await history(A);
  const beforeBooking = await reservation(fullCourt.id);
  const s = await api(ADMIN, "PATCH", "/admin/settings", { playerPrice: 30, fullCourtPrice: 120 });
  equal(s.status, 200, "settings: 30 TND per player");
  await a.page.goto(`${WEB}/terrains`);
  const dialog = await openSlot(a.page, "Court 3", "09:30", 2);
  await dialog.getByRole("radio", { name: /Juste ma place/ }).click();
  await dialog.getByText("30 TND").first().waitFor({ timeout: 10000 });
  await dialog.getByRole("radio", { name: /Terrain complet/ }).click();
  await dialog.getByText("120 TND").first().waitFor({ timeout: 10000 });
  await a.page.keyboard.press("Escape");
  const quote = await api(
    A,
    "GET",
    `/pricing/quote?terrainId=3&startTime=${encodeURIComponent(slot("09:30", 2))}`,
  );
  equal(quote.body.pricePerPerson, 30, "quoted price");
  const afterBooking = await reservation(fullCourt.id);
  equal(afterBooking.tokensCharged, beforeBooking.tokensCharged, "tokens of the earlier booking");
  equal(JSON.stringify(await history(A)), JSON.stringify(beforeLedger), "ledger");
  equal(
    (await api(ADMIN, "POST", "/admin/settings/reset", { section: "pricing" })).status,
    200,
    "reset",
  );
});

await step("a price, a token cost or a role sent with a booking is ignored", async () => {
  const before = await balance(A);
  const othersBefore = await balance(B);
  const r = await book(A, 3, "12:30", 2, {
    price: 0,
    tokensCharged: 0,
    tokenCost: 0,
    tokens_charged: 0,
    totalSpots: 99,
    userId: B.n,
    paymentMethod: "cash_club",
    role: "admin",
    status: "pending",
    bookingType: "manual",
    guestName: "Free rider",
  });
  equal(r.status, 201, "booking");
  equal(r.body.userId, A.n, "booked for the member who asked");
  equal(r.body.tokensCharged, 4, "tokens charged");
  equal(r.body.totalSpots, 4, "spots");
  equal(r.body.status, "confirmed", "status");
  equal(r.body.bookingType, "online", "channel");
  equal(r.body.guestName, null, "guest name");
  equal(await balance(A), before - 4, "balance");
  equal(await balance(B), othersBefore, "another member's balance");
  equal((await api(A, "POST", `/reservations/${r.body.id}/cancel`)).status, 200, "cleanup");
});

// ════════════════════════════════════════════════════════════════════════════
section("Time zone and notifications");

await step(
  "18:30 at the club is 18:30 everywhere: API, database, messages, a browser abroad",
  async () => {
    equal(ownSpot.startTime.slice(11, 16), "17:30", "UTC time sent by the API (club is UTC+1)");
    const [row] = await sql(
      // The columns hold the UTC instant (timestamp without time zone)
      "select to_char(start_time at time zone 'UTC' at time zone 'Africa/Tunis', 'HH24:MI') as club, to_char(start_time, 'HH24:MI') as utc from reservations where id = $1",
      [ownSpot.id],
    );
    equal(row.club, "18:30", "club time stored");
    equal(row.utc, "17:30", "instant stored");
    const note = (await notifications(A)).find(
      (n) => n.type === "booking_confirmed" && /Court Central/.test(`${n.title} ${n.message}`),
    );
    assert(/18:30/.test(note.message), `notification: ${note.message}`);
    assert(!/17:30|19:30/.test(note.message), `shifted time in: ${note.message}`);
    for (const timezoneId of ["America/New_York", "Asia/Tokyo"]) {
      const abroad = await as(A, { width: 1366, height: 900 }, { timezoneId });
      await abroad.page.goto(`${WEB}/reservations`);
      await abroad.page.getByText("Court Central").first().waitFor({ timeout: 15000 });
      const text = await abroad.page.locator("main").innerText();
      assert(/18:30/.test(text), `18:30 not shown in ${timezoneId}`);
      assert(
        !/17:30|19:30|12:30|02:30|01:30|13:30/.test(text.replace(/12:30 – 14:00/g, "")),
        `shifted time shown in ${timezoneId}`,
      );
      await abroad.page.goto(`${WEB}/terrains`);
      await openSlot(abroad.page, "Court Central", "18:30");
      await abroad.page.getByRole("dialog").getByText("Vous jouez").waitFor({ timeout: 10000 });
      await abroad.ctx.close();
    }
  },
);

await step("each event told each member once; the bell shows them", async () => {
  await new Promise((r) => setTimeout(r, 500));
  const log = await sql(
    "select user_id, kind, ref, count(*)::int as n from notification_log group by 1, 2, 3 having count(*) > 1",
  );
  equal(log.length, 0, `events logged twice: ${JSON.stringify(log)}`);
  const pairs = await sql(
    `select l.n as logged, n.n as shown from
       (select count(*)::int as n from notification_log) l,
       (select count(*)::int as n from notifications) n`,
  );
  equal(pairs[0].shown, pairs[0].logged, "notifications shown vs events sent");
  const kinds = new Set((await notifications(A)).map((n) => n.type));
  for (const k of ["welcome", "tokens_added", "booking_confirmed", "booking_cancelled"])
    assert(kinds.has(k) || k === "welcome", `the organiser never got "${k}"`);
  await a.page.goto(`${WEB}/dashboard`);
  await a.page
    .getByRole("button", { name: /Notifications, \d+ non lues/ })
    .first()
    .click();
  await a.page.getByText("Tout marquer lu").waitFor({ timeout: 10000 });
  await shot(a.page, "acc-13-notifications");
  await a.page.getByText("Tout marquer lu").click();
  await a.page
    .getByRole("button", { name: /Notifications, 0 non lues/ })
    .first()
    .waitFor({ timeout: 10000 });
  equal(
    (await notifications(A)).filter((n) => !n.isRead).length,
    0,
    "unread after “mark all read”",
  );
  const theirs = (await notifications(B))[0];
  equal(
    (await api(A, "POST", `/notifications/${theirs.id}/read`)).status,
    404,
    "marking another member's notification",
  );
});

await step("the reminder goes out once, however often the job runs", async () => {
  // A match within the reminder window, booked long enough ago not to be "just confirmed"
  const now = Date.now();
  const candidates = [0, 1].flatMap((d) =>
    ["08:00", "09:30", "11:00", "12:30", "14:00", "15:30", "17:00", "18:30", "20:00", "21:30"].map(
      (h) => ({ h, d }),
    ),
  );
  const pick = candidates.find(({ h, d }) => {
    const t = new Date(slot(h, d)).getTime();
    return t > now + 30 * 60e3 && t < now + 23 * 3600e3;
  });
  assert(pick, "no slot within the reminder window");
  const r = await api(ADMIN, "POST", "/reservations", {
    terrainId: newCourt.id,
    startTime: slot(pick.h, pick.d),
    bookingMode: "full_court",
    userId: C.n,
    paymentMethod: "cash_club",
  });
  equal(r.status, 201, `desk booking at ${pick.h}`);
  await sql(
    "update reservations set created_at = (now() at time zone 'UTC') - interval '2 hours' where id = $1",
    [r.body.id],
  );
  equal(
    (await api(ADMIN, "PATCH", "/admin/settings", { reminderLeadMinutes: 1440 })).status,
    200,
    "lead time",
  );
  const run = () =>
    fetch(`${API}/internal/jobs/run`, {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET },
    }).then((x) => x.json());
  equal(
    (await fetch(`${API}/internal/jobs/run`, { method: "POST" })).status,
    401,
    "job without the secret",
  );
  equal(
    (
      await fetch(`${API}/internal/jobs/run`, {
        method: "POST",
        headers: { "x-cron-secret": "wrong" },
      })
    ).status,
    401,
    "job with a wrong secret",
  );
  const first = await run();
  assert(first.reminders >= 1, `first run: ${JSON.stringify(first)}`);
  const second = await run();
  equal(second.reminders, 0, "reminders on the second run");
  const reminders = (await notifications(C)).filter(
    (n) => n.type === "reservation_reminder" && /Court Panoramique/.test(`${n.title} ${n.message}`),
  );
  equal(reminders.length, 1, "reminders received");
  const reminder = `${reminders[0].title} ${reminders[0].message}`;
  assert(new RegExp(pick.h).test(reminder), `reminder time: ${reminder}`);
  await api(ADMIN, "POST", `/reservations/${r.body.id}/cancel`);
  await api(ADMIN, "POST", "/admin/settings/reset", { section: "notifications" });
});

// ════════════════════════════════════════════════════════════════════════════
section("The database after all of it");

await step("no impossible state is left behind", async () => {
  const checks = {
    "balances that don't match the ledger": "select * from token_ledger_audit",
    "negative balances": "select id from users where token_balance < 0",
    "confirmed bookings overlapping on a court": `select a.id, b.id as other from reservations a join reservations b
       on a.terrain_id = b.terrain_id and a.id < b.id and a.status = 'confirmed' and b.status = 'confirmed'
       and a.start_time < b.end_time and b.start_time < a.end_time`,
    "matches with more players than spots": `select r.id from reservations r
       join reservation_players p on p.reservation_id = r.id group by r.id, r.total_spots having count(*) > r.total_spots`,
    "a member twice in one match":
      "select reservation_id, user_id from reservation_players group by 1, 2 having count(*) > 1",
    "players of a booking that doesn't exist": `select p.id from reservation_players p
       left join reservations r on r.id = p.reservation_id where r.id is null`,
    "ledger entries for a member who doesn't exist": `select t.id from token_transactions t
       left join users u on u.id = t.user_id where u.id is null`,
    "token spots whose debit is missing": `select p.id from reservation_players p
       where p.payment_type = 'token' and p.tokens_charged > 0 and not exists
       (select 1 from token_transactions t where t.reservation_id = p.reservation_id and t.user_id = p.user_id and t.type = 'debit')`,
    "refunds without a matching debit": `select t.reservation_id, t.user_id from token_transactions t
       where t.reservation_id is not null group by 1, 2
       having sum(case when t.type = 'credit' then t.amount else 0 end) > sum(case when t.type = 'debit' then t.amount else 0 end)`,
    "cancelled bookings still holding token payments": `select p.id from reservation_players p
       join reservations r on r.id = p.reservation_id
       where r.status = 'cancelled' and p.payment_type = 'token' and p.payment_status = 'paid' and p.tokens_charged > 0
       and not exists (select 1 from activity a where a.type = 'reservation_cancelled')`,
    "payment states that don't exist": `select id from reservation_players
       where payment_type not in ('token', 'cash_club', 'invited_free') or payment_status not in ('paid', 'pending', 'refunded')`,
    "two pending invitations for one member and match": `select reservation_id, invited_user_id from player_invites
       where status = 'pending' and invited_user_id is not null group by 1, 2 having count(*) > 1`,
    "bookings that end before they start":
      "select id from reservations where end_time <= start_time",
  };
  for (const [what, query] of Object.entries(checks)) {
    const rows = await sql(query);
    equal(rows.length, 0, `${what}: ${JSON.stringify(rows.slice(0, 3))}`);
  }
  const [{ circulating }] = await sql(
    "select coalesce(sum(token_balance), 0)::int as circulating from users",
  );
  const [{ net }] = await sql(
    "select coalesce(sum(case when type = 'debit' then -amount when type = 'credit' then amount else 0 end), 0)::int as net from token_transactions where type <> 'adjustment'",
  );
  equal(circulating, net, "tokens held by members vs tokens moved in the ledger");
});

await step("nothing went wrong behind the pages during the whole journey", async () => {
  const problems = [...a.page.problems, ...adminPage.page.problems].filter(
    // Refusals provoked on purpose above are answered with 4xx, which the browser logs
    (p) => !/status of 4\d\d/.test(p),
  );
  equal(problems.length, 0, problems.join(" | "));
});

await finish();
