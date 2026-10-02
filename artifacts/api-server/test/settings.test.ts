/**
 * Club settings drive every booking rule: duration, spots, prices, token costs,
 * booking window, opening hours, exceptions, cancellation policy, features and
 * notifications. These tests change them through the admin API and check that the
 * next bookings follow — nothing is hard-coded.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { client, createDatabase, dropDatabase, signup, slot, startApi, type Api } from "./harness";

let api: Api;
let call: ReturnType<typeof client>;
let admin: { id: number; token: string };
let alice: { id: number; token: string };
let bob: { id: number; token: string };
let carol: { id: number; token: string };
let court: number;
let court2: number;

const q = (sql: string, params: unknown[] = []) => api.pool.query(sql, params).then((r) => r.rows);
const balance = async (id: number) =>
  (await q("select token_balance from users where id = $1", [id]))[0].token_balance as number;
const credit = (userId: number, amount: number) =>
  call("POST", "/tokens/admin/adjust", {
    token: admin.token,
    body: { userId, type: "credit", amount, description: "Cash at the desk" },
  });
const setSettings = (body: Record<string, unknown>, token = admin.token) =>
  call("PATCH", "/admin/settings", { token, body });
const reset = (section: string) =>
  call("POST", "/admin/settings/reset", { token: admin.token, body: { section } });
const book = (
  token: string,
  start: string,
  extra: Record<string, unknown> = {},
  terrainId = court,
) =>
  call("POST", "/reservations", {
    token,
    body: { terrainId, startTime: start, bookingMode: "full_court", ...extra },
  });
/** Club date (YYYY-MM-DD) n days from now, Africa/Tunis (the test process runs in that TZ). */
const clubDate = (daysAhead: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const hhmm = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Tunis",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
const settle = () => new Promise((r) => setTimeout(r, 150)); // notifications are fire-and-forget

before(async () => {
  await createDatabase();
  api = await startApi();
  const raw = client(api.base);
  call = async (...args) => {
    const r = await raw(...args);
    if (process.env.DEBUG_API && r.status >= 400)
      console.warn(args[0], args[1], r.status, JSON.stringify(r.body));
    return r;
  };
  admin = await signup(api.pool, "owner@club.tn", { first_name: "Club", last_name: "Owner" });
  await q("update users set role = 'admin' where id = $1", [admin.id]);
  alice = await signup(api.pool, "alice@test.tn", { first_name: "Alice", last_name: "Ben Salah" });
  bob = await signup(api.pool, "bob@test.tn", { first_name: "Bob", last_name: "Trabelsi" });
  carol = await signup(api.pool, "carol@test.tn", { first_name: "Carol" });
  court = (
    await call("POST", "/terrains", {
      token: admin.token,
      body: { name: "Court 1", type: "indoor" },
    })
  ).body.id;
  court2 = (
    await call("POST", "/terrains", {
      token: admin.token,
      body: { name: "Court 2", type: "outdoor" },
    })
  ).body.id;
  for (const u of [alice, bob, carol]) assert.equal((await credit(u.id, 50)).status, 200);
});

after(async () => {
  const audit = await q("select * from token_ledger_audit");
  assert.deepEqual(audit, [], "token ledger mismatch");
  await api?.close();
  await dropDatabase();
});

describe("settings API", () => {
  test("public settings expose the installation defaults", async () => {
    const r = await call("GET", "/settings");
    assert.equal(r.status, 200);
    assert.equal(r.body.bookingDurationMinutes, 90);
    assert.equal(r.body.maxPlayers, 4);
    assert.equal(r.body.minPlayers, 1);
    assert.equal(r.body.playerPrice, 25);
    assert.equal(r.body.fullCourtPrice, 100);
    assert.equal(r.body.tokenCostPlayer, 1);
    assert.equal(r.body.tokenCostFullCourt, 4);
    assert.equal(r.body.currency, "TND");
    assert.equal(r.body.minAdvanceMinutes, 30);
    assert.equal(r.body.maxAdvanceDays, 14);
    assert.deepEqual(
      r.body.tokenPackages.map((p: any) => [p.tokens, p.price]),
      [
        [10, 250],
        [20, 480],
        [50, 1150],
      ],
    );
    assert.equal(r.body.openingHours.length, 7);
    assert.equal(r.body.updatedBy, undefined, "audit fields are not public");
  });

  test("only admins read or change settings", async () => {
    assert.equal((await call("GET", "/admin/settings")).status, 401);
    assert.equal((await call("GET", "/admin/settings", { token: alice.token })).status, 403);
    assert.equal((await setSettings({ playerPrice: 1 }, alice.token)).status, 403);
    assert.equal(
      (await call("PUT", "/admin/opening-hours", { token: alice.token, body: {} })).status,
      403,
    );
    assert.equal(
      (
        await call("POST", "/admin/token-packages", {
          token: alice.token,
          body: { name: "x", tokens: 1, price: 0 },
        })
      ).status,
      403,
    );
    assert.equal((await call("GET", "/settings")).body.playerPrice, 25);
  });

  test("invalid values are refused with the field name; nothing is saved", async () => {
    for (const body of [
      { bookingDurationMinutes: 7 },
      { bookingDurationMinutes: 600 },
      { maxPlayers: 0 },
      { minPlayers: 4, maxPlayers: 2 },
      { playerPrice: -5 },
      { currency: "dinar" },
      { lateCancellation: "maybe" },
      { tokenCostPlayer: 1.5 },
      { playerPrice: "25" },
      { id: 2 },
      { updatedBy: alice.id },
      {},
    ]) {
      const r = await setSettings(body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal(r.body.code, "VALIDATION_ERROR");
    }
    const s = (await call("GET", "/admin/settings", { token: admin.token })).body;
    assert.equal(s.bookingDurationMinutes, 90);
    assert.equal(s.maxPlayers, 4);
  });

  test("a change is audited with who did it", async () => {
    assert.equal((await setSettings({ tokenUnitPrice: 26 })).status, 200);
    const s = (await call("GET", "/admin/settings", { token: admin.token })).body;
    assert.equal(s.updatedBy, admin.id);
    const log = await q(
      "select message from activity where type = 'settings_updated' order by id desc limit 1",
    );
    assert.match(log[0].message, /tokenUnitPrice: 25 → 26/);
    assert.equal((await reset("tokens")).body.tokenUnitPrice, 25);
  });
});

describe("production scenario: the admin changes duration and prices", () => {
  let booked60: number;

  test("60-minute matches, 30 TND per player, 2 tokens a spot, 6 a court", async () => {
    const r = await setSettings({
      bookingDurationMinutes: 60,
      playerPrice: 30,
      fullCourtPrice: 120,
      tokenCostPlayer: 2,
      tokenCostFullCourt: 6,
    });
    assert.equal(r.status, 200);

    const cal = await call("GET", `/calendar?date=${clubDate(1)}`);
    const slots = cal.body.terrains.find((t: any) => t.terrain.id === court).slots;
    assert.deepEqual(
      slots.slice(0, 3).map((s: any) => hhmm(s.startTime)),
      ["08:00", "09:00", "10:00"],
    );
    assert.equal(slots.length, 15, "08:00 → 23:00 in 60-minute slots");
    assert.equal(slots[0].pricePerPerson, 30);
    assert.equal(slots[0].tokensPerSpot, 2);
    assert.equal(slots[0].tokensFullCourt, 6);
    assert.equal(slots[0].fullCourtPrice, 120);
    assert.equal(
      new Date(slots[0].endTime).getTime() - new Date(slots[0].startTime).getTime(),
      60 * 60_000,
    );
  });

  test("the next booking follows the new rules", async () => {
    const before = await balance(alice.id);
    // 09:00 was off the old 90-minute grid
    const r = await book(alice.token, slot("09:00"));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    booked60 = r.body.id;
    assert.equal(
      new Date(r.body.endTime).getTime() - new Date(r.body.startTime).getTime(),
      60 * 60_000,
    );
    assert.equal(r.body.tokensCharged, 6);
    assert.equal(r.body.totalSpots, 4);
    assert.equal(await balance(alice.id), before - 6);

    const own = await book(bob.token, slot("10:00"), { bookingMode: "own_spot" });
    assert.equal(own.status, 201);
    assert.equal(own.body.tokensCharged, 2);

    const off = await book(alice.token, slot("08:30"));
    assert.equal(off.status, 400);
    assert.equal(off.body.code, "INVALID_SLOT");
  });

  test("max players: new matches get the new number of spots", async () => {
    assert.equal((await setSettings({ maxPlayers: 2, minPlayers: 1 })).status, 200);
    const r = await book(carol.token, slot("11:00"), { bookingMode: "own_spot" });
    assert.equal(r.status, 201);
    assert.equal(r.body.totalSpots, 2);
    const join = await call("POST", `/reservations/${r.body.id}/join`, {
      token: bob.token,
      body: {},
    });
    assert.equal(join.status, 201);
    const third = await call("POST", `/reservations/${r.body.id}/join`, {
      token: alice.token,
      body: {},
    });
    assert.equal(third.status, 409);
    assert.equal(third.body.code, "MATCH_FULL");
  });

  test("back to the defaults: old bookings keep their times and still block the court", async () => {
    assert.equal((await reset("booking")).body.bookingDurationMinutes, 90);
    assert.equal((await reset("pricing")).body.playerPrice, 25);
    assert.equal((await reset("tokens")).body.tokenCostFullCourt, 4);

    const cal = await call("GET", `/calendar?date=${clubDate(1)}`);
    const slots = cal.body.terrains.find((t: any) => t.terrain.id === court).slots;
    const mine = slots.find((s: any) => s.reservationId === booked60);
    assert.ok(mine, "the 60-minute booking is still shown");
    assert.equal(hhmm(mine.startTime), "09:00");
    // No free slot may overlap an existing booking
    for (const s of slots.filter((s: any) => !s.reservationId))
      for (const b of slots.filter((s: any) => s.reservationId))
        assert.ok(
          s.endTime <= b.startTime || s.startTime >= b.endTime,
          `${s.startTime} overlaps ${b.startTime}`,
        );
    // 08:00–09:30 would overlap 09:00–10:00: the database refuses it too
    const clash = await book(bob.token, slot("08:00"));
    assert.equal(clash.status, 409);
    assert.equal(clash.body.code, "SLOT_TAKEN");
    assert.equal((await book(bob.token, slot("08:00"), {}, court2)).status, 201);
  });
});

describe("booking window and opening hours", () => {
  test("minimum notice and maximum advance come from the settings (admins exempt)", async () => {
    assert.equal((await setSettings({ minAdvanceMinutes: 4320 })).status, 200);
    let r = await book(alice.token, slot("12:30", 2));
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "TOO_LATE_TO_BOOK");
    const adm = await book(admin.token, slot("12:30", 2), { guestName: "Walk-in" });
    assert.equal(adm.status, 201, JSON.stringify(adm.body));

    assert.equal((await setSettings({ minAdvanceMinutes: 30, maxAdvanceDays: 2 })).status, 200);
    r = await book(alice.token, slot("12:30", 5));
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "TOO_FAR_AHEAD");
    const cal = await call("GET", `/calendar?date=${clubDate(5)}`, { token: alice.token });
    assert.ok(cal.body.terrains[0].slots.every((s: any) => s.bookable === false));
    await reset("booking");
  });

  test("a weekday closed in the opening hours can't be booked", async () => {
    const hours = (await call("GET", "/settings")).body.openingHours;
    const weekday = new Date(slot("12:00", 3)).getDay();
    const days = hours.map((h: any) => (h.weekday === weekday ? { ...h, isClosed: true } : h));
    assert.equal(
      (await call("PUT", "/admin/opening-hours", { token: admin.token, body: { days } })).status,
      200,
    );
    const r = await book(alice.token, slot("12:30", 3));
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "CLUB_CLOSED");
    const cal = await call("GET", `/calendar?date=${clubDate(3)}`);
    assert.equal(cal.body.terrains[0].slots.length, 0);
    assert.equal(cal.body.terrains[0].closures[0].date, clubDate(3));

    const bad = days.map((h: any) =>
      h.weekday === weekday ? { ...h, isClosed: false, openTime: "22:00", closeTime: "09:00" } : h,
    );
    assert.equal(
      (await call("PUT", "/admin/opening-hours", { token: admin.token, body: { days: bad } }))
        .status,
      400,
    );
    assert.equal((await reset("openingHours")).status, 200);
    assert.equal((await book(alice.token, slot("12:30", 3))).status, 201);
  });

  test("holidays and exceptional hours override the week", async () => {
    const holiday = await call("POST", "/admin/schedule-exceptions", {
      token: admin.token,
      body: { date: clubDate(4), reason: "Aïd" },
    });
    assert.equal(holiday.status, 201);
    const r = await book(alice.token, slot("14:00", 4));
    assert.equal(r.body.code, "CLUB_CLOSED");
    assert.match(r.body.error, /Aïd/);
    const dup = await call("POST", "/admin/schedule-exceptions", {
      token: admin.token,
      body: { date: clubDate(4) },
    });
    assert.equal(dup.status, 409);
    await call("DELETE", `/admin/schedule-exceptions/${holiday.body.id}`, { token: admin.token });
    assert.equal((await book(alice.token, slot("14:00", 4))).status, 201);

    // Short day on one court only: 10:00–13:00
    const short = await call("POST", "/admin/schedule-exceptions", {
      token: admin.token,
      body: {
        date: clubDate(2),
        terrainId: court2,
        isClosed: false,
        openTime: "10:00",
        closeTime: "13:00",
        reason: "Tournoi",
      },
    });
    assert.equal(short.status, 201);
    const cal = await call("GET", `/calendar?date=${clubDate(2)}&terrainIds=${court2}`);
    assert.deepEqual(
      cal.body.terrains[0].slots.map((s: any) => hhmm(s.startTime)),
      ["10:00", "11:30"],
    );
    assert.equal(
      (await book(alice.token, slot("08:00", 2), {}, court2)).body.code,
      "OUTSIDE_OPENING_HOURS",
    );
    assert.equal((await book(alice.token, slot("10:00", 2), {}, court2)).status, 201);
  });
});

describe("courts", () => {
  test("price override, maintenance, archive, order", async () => {
    let r = await call("PATCH", `/terrains/${court2}`, {
      token: admin.token,
      body: { pricePerPerson: 40, number: 2 },
    });
    assert.equal(r.status, 200);
    const quote = await call(
      "GET",
      `/pricing/quote?terrainId=${court2}&startTime=${encodeURIComponent(slot("17:00", 6))}`,
    );
    assert.equal(quote.body.pricePerPerson, 40);
    assert.equal(quote.body.fullCourtPrice, 160);
    r = await call("PATCH", `/terrains/${court2}`, {
      token: admin.token,
      body: { pricePerPerson: null },
    });
    assert.equal(r.body.pricePerPerson, null, "back to the club price");

    r = await call("PATCH", `/terrains/${court2}`, {
      token: admin.token,
      body: { openingTime: "09:00" },
    });
    assert.equal(r.status, 400, "both hours or neither");

    r = await call("PATCH", `/terrains/${court2}`, {
      token: admin.token,
      body: { isMaintenance: true, maintenanceNote: "New turf" },
    });
    assert.equal(r.status, 200);
    assert.ok(r.body.upcomingBookings > 0, "the admin is told about existing bookings");
    const m = await book(alice.token, slot("17:00", 6), {}, court2);
    assert.equal(m.body.code, "COURT_MAINTENANCE");
    const cal = await call("GET", `/calendar?date=${clubDate(6)}&terrainIds=${court2}`);
    assert.equal(cal.body.terrains[0].terrain.isMaintenance, true);
    assert.ok(cal.body.terrains[0].slots.every((s: any) => !s.bookable));

    const arch = await call("POST", `/terrains/${court2}/archive`, { token: admin.token });
    assert.equal(arch.status, 409);
    assert.equal(arch.body.code, "COURT_HAS_BOOKINGS");

    const c3 = (
      await call("POST", "/terrains", {
        token: admin.token,
        body: { name: "Court 3", type: "outdoor" },
      })
    ).body;
    assert.equal(
      (await call("POST", `/terrains/${c3.id}/archive`, { token: admin.token })).status,
      200,
    );
    const visible = (await call("GET", "/terrains", { token: alice.token })).body.map(
      (t: any) => t.id,
    );
    assert.ok(!visible.includes(c3.id), "archived court hidden");
    const archived = (
      await call("GET", "/terrains?archived=true", { token: admin.token })
    ).body.map((t: any) => t.id);
    assert.deepEqual(archived, [c3.id]);

    const order = await call("PUT", "/terrains/order", {
      token: admin.token,
      body: { ids: [court2, court] },
    });
    assert.equal(order.status, 200);
    const list = (await call("GET", "/terrains", { token: admin.token })).body.map(
      (t: any) => t.id,
    );
    assert.deepEqual(list, [court2, court]);
    await call("PATCH", `/terrains/${court2}`, {
      token: admin.token,
      body: { isMaintenance: false },
    });
  });
});

describe("cancellation policy", () => {
  test("'forbid': no cancellation inside the notice period", async () => {
    const r = await book(alice.token, slot("20:00", 1));
    assert.equal(r.status, 201);
    assert.equal(
      (await setSettings({ cancellationNoticeHours: 72, lateCancellation: "forbid" })).status,
      200,
    );
    const c = await call("POST", `/reservations/${r.body.id}/cancel`, { token: alice.token });
    assert.equal(c.status, 400);
    assert.equal(c.body.code, "CANCELLATION_CLOSED");
    assert.equal(c.body.cancellationNoticeHours ?? 72, 72);
  });

  test("'no_refund': late cancellation allowed, the booker's tokens are kept", async () => {
    await setSettings({ lateCancellation: "no_refund" });
    const r = await book(bob.token, slot("21:30", 1));
    const before = await balance(bob.id);
    const c = await call("POST", `/reservations/${r.body.id}/cancel`, { token: bob.token });
    assert.equal(c.status, 200);
    assert.equal(c.body.refundForfeited, true);
    assert.equal(await balance(bob.id), before);
    // An admin cancellation always refunds
    const r2 = await book(carol.token, slot("20:00", 2));
    const b2 = await balance(carol.id);
    assert.equal(
      (await call("POST", `/reservations/${r2.body.id}/cancel`, { token: admin.token })).status,
      200,
    );
    assert.equal(await balance(carol.id), b2 + 4);
    await reset("booking");
  });
});

describe("features", () => {
  let match: number;
  before(async () => {
    match = (await book(alice.token, slot("15:30", 2), { bookingMode: "own_spot", isPublic: true }))
      .body.id;
  });

  test("open matches off: no public list, no joining from the calendar", async () => {
    assert.equal((await call("GET", "/open-matches")).body.length, 1);
    await setSettings({ openMatchesEnabled: false });
    assert.deepEqual((await call("GET", "/open-matches")).body, []);
    const j = await call("POST", `/reservations/${match}/join`, { token: bob.token, body: {} });
    assert.equal(j.status, 403);
    assert.equal(j.body.code, "FEATURE_DISABLED");
    await setSettings({ openMatchesEnabled: true });
  });

  test("pay-at-the-club off: players must use tokens", async () => {
    await setSettings({ cashPaymentEnabled: false });
    const j = await call("POST", `/reservations/${match}/join`, {
      token: bob.token,
      body: { paymentMethod: "cash_club" },
    });
    assert.equal(j.status, 400);
    assert.equal(j.body.code, "CASH_DISABLED");
    await setSettings({ cashPaymentEnabled: true });
  });

  test("invitations off: no links, no personal invitations", async () => {
    await setSettings({ invitationsEnabled: false });
    const i = await call("POST", `/reservations/${match}/invite`, { token: alice.token, body: {} });
    assert.equal(i.status, 403);
    assert.equal(i.body.code, "FEATURE_DISABLED");
    await setSettings({ invitationsEnabled: true });
  });
});

describe("personal invitations", () => {
  let match: number;
  before(async () => {
    match = (await book(alice.token, slot("18:30", 3))).body.id;
  });

  test("member search shows public names only, needs a login", async () => {
    assert.equal((await call("GET", "/members/search?q=bo")).status, 401);
    const r = await call("GET", "/members/search?q=bo", { token: alice.token });
    assert.deepEqual(r.body, [{ id: bob.id, name: "Bob T." }]);
    assert.ok(!JSON.stringify(r.body).includes("@"), "no e-mail leaks");
    const byMail = await call("GET", "/members/search?q=carol@test.tn", { token: alice.token });
    assert.deepEqual(
      byMail.body.map((u: any) => u.id),
      [carol.id],
    );
    const wildcard = await call("GET", "/members/search?q=%25%25", { token: alice.token });
    assert.deepEqual(wildcard.body, [], "LIKE wildcards are escaped");
  });

  test("invite a member: notified, can decline; only them", async () => {
    const inv = await call("POST", `/reservations/${match}/invite`, {
      token: alice.token,
      body: { userId: bob.id },
    });
    assert.equal(inv.status, 201);
    const again = await call("POST", `/reservations/${match}/invite`, {
      token: alice.token,
      body: { userId: bob.id },
    });
    assert.equal(again.body.code, "ALREADY_INVITED");
    await settle();
    const n = await q(
      "select title from notifications where user_id = $1 and type = 'invitation'",
      [bob.id],
    );
    assert.equal(n.length, 1);

    const mine = await call("GET", "/invites", { token: bob.token });
    assert.equal(mine.body.length, 1);
    assert.equal(mine.body[0].invitedBy, "Alice B.");
    const token = mine.body[0].token;

    assert.equal(
      (await call("POST", `/invites/${token}/accept`, { token: carol.token, body: {} })).status,
      403,
    );
    assert.equal(
      (await call("POST", `/invites/${token}/decline`, { token: carol.token })).status,
      403,
    );
    assert.equal(
      (await call("POST", `/invites/${token}/decline`, { token: bob.token })).status,
      200,
    );
    assert.equal((await call("GET", "/invites", { token: bob.token })).body.length, 0);
    const gone = await call("POST", `/invites/${token}/accept`, { token: bob.token, body: {} });
    assert.equal(gone.body.code, "INVITE_DECLINED");
  });

  test("accepting a full-court invitation is free and single-use", async () => {
    const inv = await call("POST", `/reservations/${match}/invite`, {
      token: alice.token,
      body: { userId: bob.id },
    });
    const before = await balance(bob.id);
    const ok = await call("POST", `/invites/${inv.body.token}/accept`, {
      token: bob.token,
      body: {},
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.paymentType, "invited_free");
    assert.equal(await balance(bob.id), before);
    const twice = await call("POST", `/invites/${inv.body.token}/accept`, {
      token: bob.token,
      body: {},
    });
    assert.equal(twice.status, 410);
    const players = await q(
      "select user_id, payment_type from reservation_players where reservation_id = $1",
      [match],
    );
    assert.equal(players.length, 2);
  });
});

describe("tokens: packs, cash and minimum purchase", () => {
  test("selling a pack records the tokens and the cash received", async () => {
    const packs = (await call("GET", "/admin/token-packages", { token: admin.token })).body;
    const pack10 = packs.find((p: any) => p.tokens === 10);
    const before = await balance(carol.id);
    const r = await call("POST", "/tokens/admin/adjust", {
      token: admin.token,
      body: { userId: carol.id, type: "credit", packageId: pack10.id, idempotencyKey: "pack-1" },
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await balance(carol.id), before + 10);
    const [row] = await q(
      "select amount, cash_amount, package_id from token_transactions where id = $1",
      [r.body.id],
    );
    assert.deepEqual(row, { amount: 10, cash_amount: "250.00", package_id: pack10.id });

    // Off sale → refused; sold → can't be deleted
    await call("PATCH", `/admin/token-packages/${pack10.id}`, {
      token: admin.token,
      body: { isActive: false },
    });
    const off = await call("POST", "/tokens/admin/adjust", {
      token: admin.token,
      body: { userId: carol.id, type: "credit", packageId: pack10.id },
    });
    assert.equal(off.body.code, "PACKAGE_UNAVAILABLE");
    assert.equal(
      (await call("DELETE", `/admin/token-packages/${pack10.id}`, { token: admin.token })).body
        .code,
      "PACKAGE_USED",
    );
    assert.ok(
      !(await call("GET", "/settings")).body.tokenPackages.some((p: any) => p.id === pack10.id),
    );
  });

  test("packs: the admin adds, changes and deletes them; players see those on sale", async () => {
    const add = (body: Record<string, unknown>) =>
      call("POST", "/admin/token-packages", { token: admin.token, body });
    for (const body of [
      { name: "Free", tokens: 10, price: 0 },
      { name: "Negative", tokens: 10, price: -5 },
      { name: "", tokens: 10, price: 200 },
      { name: "Zero", tokens: 0, price: 200 },
      { name: "Half", tokens: 2.5, price: 50 },
    ]) {
      const bad = await add(body);
      assert.equal(bad.status, 400, JSON.stringify(body));
    }
    const created = await add({ name: "Promo 10", tokens: 10, price: 200 });
    assert.equal(created.status, 201);
    const id = created.body.id;
    const shown = async () =>
      (await call("GET", "/settings")).body.tokenPackages.find((p: any) => p.id === id);
    assert.deepEqual(await shown(), { id, name: "Promo 10", tokens: 10, price: 200 });

    const edit = await call("PATCH", `/admin/token-packages/${id}`, {
      token: admin.token,
      body: { name: "Promo 12", tokens: 12, price: 230 },
    });
    assert.equal(edit.status, 200);
    assert.deepEqual(await shown(), { id, name: "Promo 12", tokens: 12, price: 230 });
    const zero = await call("PATCH", `/admin/token-packages/${id}`, {
      token: admin.token,
      body: { price: 0 },
    });
    assert.equal(zero.status, 400);
    assert.equal((await shown()).price, 230, "unchanged");

    // Never sold → it can be deleted, and players no longer see it
    const del = await call("DELETE", `/admin/token-packages/${id}`, { token: admin.token });
    assert.equal(del.status, 204);
    assert.equal(await shown(), undefined);
    assert.equal(
      (await call("DELETE", `/admin/token-packages/${id}`, { token: admin.token })).status,
      404,
    );
  });

  test("minimum purchase applies to sales, not to gifts", async () => {
    await setSettings({ tokenMinPurchase: 5 });
    const sale = await call("POST", "/tokens/admin/adjust", {
      token: admin.token,
      body: { userId: carol.id, type: "credit", amount: 2, cashAmount: 50, description: "Cash" },
    });
    assert.equal(sale.status, 400);
    assert.equal(sale.body.code, "BELOW_MIN_PURCHASE");
    assert.equal((await credit(carol.id, 2)).status, 200, "a gift/correction has no minimum");
    await reset("tokens");
  });
});

describe("notifications switches", () => {
  test("a disabled notification type is not sent; others still are", async () => {
    await setSettings({ cancellationNotificationsEnabled: false });
    const r = await book(carol.token, slot("08:00", 5));
    assert.equal(r.status, 201);
    await call("POST", `/reservations/${r.body.id}/cancel`, { token: carol.token });
    await settle();
    const sent = (
      await q("select kind from notification_log where user_id = $1 and ref = any($2)", [
        carol.id,
        [`booking:${r.body.id}`, `cancel:${r.body.id}`],
      ])
    ).map((n) => n.kind);
    assert.deepEqual(sent, ["booking_confirmed"]);
    await reset("notifications");
  });
});
