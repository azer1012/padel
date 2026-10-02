import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { client, createDatabase, dropDatabase, signup, slot, startApi, type Api } from "./harness";

let api: Api;
let call: ReturnType<typeof client>;
type Member = { id: number; token: string };
let admin: Member, alice: Member, bob: Member, carol: Member, erin: Member;
let courtA: number;
let courtB: number;

const q = (sql: string, params: unknown[] = []) => api.pool.query(sql, params).then((r) => r.rows);
const balance = async (id: number) =>
  (await q("select token_balance from users where id = $1", [id]))[0].token_balance as number;
const credit = (userId: number, amount: number) =>
  call("POST", "/tokens/admin/adjust", {
    token: admin.token,
    body: { userId, type: "credit", amount, description: "Cash at the desk" },
  });
const clubDate = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(new Date(iso));
const clubTime = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Tunis",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
const activity = (type: string) => q("select message from activity where type = $1", [type]);

before(async () => {
  await createDatabase();
  api = await startApi();
  call = client(api.base);
  admin = await signup(api.pool, "owner@club.tn", { first_name: "Club", last_name: "Owner" });
  await q("update users set role = 'admin' where id = $1", [admin.id]);
  alice = await signup(api.pool, "alice@test.tn", {
    first_name: "Alice",
    last_name: "Ben Salah",
    phone: "+21620000000",
  });
  bob = await signup(api.pool, "bob@test.tn", { first_name: "Bob", last_name: "Trabelsi" });
  carol = await signup(api.pool, "carol@test.tn", { first_name: "Carol" });
  erin = await signup(api.pool, "erin@test.tn", { first_name: "Erin" });
  const a = await call("POST", "/terrains", {
    token: admin.token,
    body: { name: "Court A", type: "indoor" },
  });
  const b = await call("POST", "/terrains", {
    token: admin.token,
    body: { name: "Court B", type: "outdoor" },
  });
  courtA = a.body.id;
  courtB = b.body.id;
});

after(async () => {
  const audit = await q("select * from token_ledger_audit");
  assert.deepEqual(audit, [], "token ledger mismatch");
  await api?.close();
  await dropDatabase();
});

describe("private data of other members", () => {
  let matchId: number;

  before(async () => {
    await credit(alice.id, 3);
    await credit(bob.id, 3);
    const r = await call("POST", "/reservations", {
      token: alice.token,
      body: {
        terrainId: courtA,
        startTime: slot("08:00", 2),
        bookingMode: "own_spot",
        isPublic: true,
        notes: "door code 4321",
      },
    });
    assert.equal(r.status, 201);
    matchId = r.body.id;
    const j = await call("POST", `/reservations/${matchId}/join`, { token: bob.token });
    assert.equal(j.status, 201);
  });

  const assertPublicOnly = (u: Record<string, unknown>) => {
    for (const k of ["email", "phone", "tokenBalance", "supabaseAuthId", "role"])
      assert.equal(k in u, false, `${k} must not be sent to another member`);
    assert.equal(u.firstName, "Alice");
    assert.equal(u.lastName, "B.", "only the initial of the last name");
  };

  test("a co-player gets names only: no e-mail, phone, balance or auth id", async () => {
    for (const path of [`/reservations/${matchId}`, "/reservations/upcoming", "/reservations"]) {
      const res = await call("GET", path, { token: bob.token });
      assert.equal(res.status, 200, path);
      const r = Array.isArray(res.body)
        ? res.body.find((x: any) => x.id === matchId)
        : (res.body.data?.find((x: any) => x.id === matchId) ?? res.body);
      assertPublicOnly(r.user);
      assertPublicOnly(r.players.find((p: any) => p.userId === alice.id).user);
      assert.equal(r.notes, null, "the booker's notes stay private");
      // …and still sees their own row in full
      assert.equal(r.players.find((p: any) => p.userId === bob.id).user.email, "bob@test.tn");
    }
  });

  test("the booker and the admin still see what they need", async () => {
    const mine = await call("GET", `/reservations/${matchId}`, { token: alice.token });
    assert.equal(mine.body.notes, "door code 4321");
    assert.equal(mine.body.user.email, "alice@test.tn");
    const desk = await call("GET", `/reservations/${matchId}`, { token: admin.token });
    assert.equal(desk.body.players.find((p: any) => p.userId === bob.id).user.email, "bob@test.tn");
  });

  test("a member outside the match is refused", async () => {
    const r = await call("GET", `/reservations/${matchId}`, { token: carol.token });
    assert.equal(r.status, 403);
    const list = await call("GET", "/reservations", { token: carol.token });
    assert.deepEqual(list.body.data, []);
  });

  test("member search returns a public name, never contact details", async () => {
    const r = await call("GET", "/members/search?q=alice", { token: bob.token });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, [{ id: alice.id, name: "Alice B." }]);
  });
});

describe("tokens under concurrency", () => {
  test("two simultaneous joins with one token: one succeeds, the balance never goes negative", async () => {
    await credit(carol.id, 2);
    await credit(erin.id, 1);
    const m1 = await call("POST", "/reservations", {
      token: carol.token,
      body: { terrainId: courtA, startTime: slot("09:30", 3), bookingMode: "own_spot" },
    });
    const m2 = await call("POST", "/reservations", {
      token: carol.token,
      body: { terrainId: courtB, startTime: slot("09:30", 3), bookingMode: "own_spot" },
    });
    assert.equal(m1.status, 201);
    assert.equal(m2.status, 201);
    const results = await Promise.all(
      [m1.body.id, m2.body.id].map((id) =>
        call("POST", `/reservations/${id}/join`, { token: erin.token }),
      ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 400]);
    assert.equal(results.find((r) => r.status === 400)!.body.code, "INSUFFICIENT_TOKENS");
    assert.equal(await balance(erin.id), 0);
    const [{ n }] = await q(
      "select count(*)::int as n from reservation_players where user_id = $1",
      [erin.id],
    );
    assert.equal(n, 1, "the refused join must leave no spot behind");
  });
});

describe("time", () => {
  test("creation times are real instants whatever the database server's timezone", async () => {
    const [r] = (await call("GET", "/reservations", { token: admin.token })).body.data;
    assert.ok(Math.abs(Date.now() - new Date(r.createdAt).getTime()) < 120_000, r.createdAt);
  });

  test("a weekly series keeps the club's wall-clock time", async () => {
    const r = await call("POST", "/admin/series", {
      token: admin.token,
      body: {
        terrainId: courtB,
        firstStart: slot("20:00", 4),
        occurrences: 3,
        guestName: "École de padel",
      },
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.created.length, 3);
    assert.deepEqual(r.body.created.map(clubTime), ["20:00", "20:00", "20:00"]);
    const days = r.body.created.map((d: string) => new Date(`${clubDate(d)}T12:00:00Z`).getTime());
    assert.equal(days[1] - days[0], 7 * 86_400_000);
    assert.equal(days[2] - days[1], 7 * 86_400_000);
  });

  test("series input is validated instead of crashing", async () => {
    const bad = await call("POST", "/admin/series", {
      token: admin.token,
      body: { terrainId: courtB, firstStart: slot("18:30", 5), occurrences: 3, guestName: 42 },
    });
    assert.equal(bad.status, 400);
    assert.equal(
      (await call("POST", "/admin/series/abc/cancel", { token: admin.token })).status,
      400,
    );
    assert.equal(
      (await call("POST", "/admin/series/99999/cancel", { token: admin.token })).status,
      404,
    );
  });
});

describe("equipment", () => {
  let itemId: number;
  let start: string;

  test("item input is validated", async () => {
    const bad = await call("POST", "/admin/equipment", {
      token: admin.token,
      body: { name: "Raquette", price: "1e999", stock: 1 },
    });
    assert.equal(bad.status, 400);
    assert.equal(
      (await call("POST", "/admin/equipment", { token: admin.token, body: {} })).status,
      400,
    );
    const ok = await call("POST", "/admin/equipment", {
      token: admin.token,
      body: { name: "Raquette", price: 5, stock: 1 },
    });
    assert.equal(ok.status, 201);
    itemId = ok.body.id;
  });

  test("availability follows the club's match length, and the desk list the club's day", async () => {
    start = slot("14:00", 2);
    const r = await call("POST", "/reservations", {
      token: alice.token,
      body: {
        terrainId: courtB,
        startTime: start,
        bookingMode: "own_spot",
        equipment: [{ itemId, quantity: 1 }],
      },
    });
    assert.equal(r.status, 201);
    const free = async (iso: string) =>
      (await call("GET", `/equipment?startTime=${encodeURIComponent(iso)}`)).body[0].available;
    assert.equal(await free(start), 0);
    const earlier = new Date(new Date(start).getTime() - 100 * 60_000).toISOString();
    assert.equal(await free(earlier), 1, "a 90-minute match 100 minutes earlier doesn't overlap");

    // Two-hour matches: the same earlier start now overlaps the rental
    const set = await call("PATCH", "/admin/settings", {
      token: admin.token,
      body: { bookingDurationMinutes: 120 },
    });
    assert.equal(set.status, 200);
    assert.equal(await free(earlier), 0);
    await call("PATCH", "/admin/settings", {
      token: admin.token,
      body: { bookingDurationMinutes: 90 },
    });

    const list = await call("GET", `/admin/equipment/rentals?date=${clubDate(start)}`, {
      token: admin.token,
    });
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].item.id, itemId);
    const next = new Date(new Date(start).getTime() + 86_400_000).toISOString();
    const other = await call("GET", `/admin/equipment/rentals?date=${clubDate(next)}`, {
      token: admin.token,
    });
    assert.deepEqual(other.body, []);
  });
});

describe("admin input validation", () => {
  test("news: required fields and safe image links", async () => {
    const post = (body: unknown) => call("POST", "/news", { token: admin.token, body });
    assert.equal((await post({ content: "x" })).status, 400);
    assert.equal((await post({ title: "x" })).status, 400);
    assert.equal(
      (await post({ title: "x", content: "y", imageUrl: "javascript:alert(1)" })).status,
      400,
    );
    const ok = await post({ title: "Tournoi", content: "Samedi", isPublished: true });
    assert.equal(ok.status, 201);
    assert.ok(ok.body.publishedAt);
    // A partial edit keeps the other fields
    const patch = await call("PATCH", `/news/${ok.body.id}`, {
      token: admin.token,
      body: { excerpt: "Inscriptions ouvertes" },
    });
    assert.equal(patch.status, 200);
    assert.equal(patch.body.title, "Tournoi");
    assert.equal(patch.body.isPublished, true);
    assert.equal((await call("GET", "/news/abc")).status, 400);
  });

  test("pricing rules: times, price and court are checked", async () => {
    const post = (body: unknown) =>
      call("POST", "/admin/pricing/rules", { token: admin.token, body });
    const base = { name: "Soirée", startTime: "17:00", endTime: "23:00", tokensPerSpot: 2 };
    assert.equal((await post({ ...base, startTime: "24:30" })).status, 400);
    assert.equal((await post({ ...base, pricePerPerson: "abc" })).status, 400);
    assert.equal((await post({ ...base, daysOfWeek: "monday" })).status, 400);
    assert.equal((await post({ ...base, terrainId: 99999 })).status, 404);
    const ok = await post({ ...base, isPeak: true });
    assert.equal(ok.status, 201);
    // Moving one bound past the stored other bound is refused
    const flip = await call("PATCH", `/admin/pricing/rules/${ok.body.id}`, {
      token: admin.token,
      body: { endTime: "16:00" },
    });
    assert.equal(flip.status, 400);
    assert.equal(
      (await call("DELETE", `/admin/pricing/rules/${ok.body.id}`, { token: admin.token })).status,
      204,
    );
    assert.equal((await activity("pricing_updated")).length, 2);
  });

  test("push: a member can only unsubscribe their own device", async () => {
    const sub = {
      endpoint: "https://push.example/device-1",
      keys: { p256dh: "BPk_a-b", auth: "x1" },
    };
    assert.equal(
      (await call("POST", "/push/subscribe", { token: alice.token, body: sub })).status,
      201,
    );
    assert.equal(
      (
        await call("POST", "/push/subscribe", {
          token: alice.token,
          body: { ...sub, keys: { p256dh: { a: 1 }, auth: "x" } },
        })
      ).status,
      400,
    );
    const count = async () =>
      (await q("select count(*)::int as n from push_subscriptions"))[0].n as number;
    await call("POST", "/push/unsubscribe", { token: bob.token, body: { endpoint: sub.endpoint } });
    assert.equal(await count(), 1);
    await call("POST", "/push/unsubscribe", {
      token: alice.token,
      body: { endpoint: sub.endpoint },
    });
    assert.equal(await count(), 0);
  });
});

describe("audit trail", () => {
  test("cash marked at the desk, role changes and court changes are recorded with the admin", async () => {
    const r = await call("POST", "/reservations", {
      token: admin.token,
      body: {
        terrainId: courtA,
        startTime: slot("17:00", 2),
        userId: carol.id,
        paymentMethod: "cash_club",
      },
    });
    assert.equal(r.status, 201);
    const playerId = r.body.players[0].id;
    const mark = () =>
      call("PATCH", `/reservations/${r.body.id}/players/${playerId}`, {
        token: admin.token,
        body: { paymentStatus: "paid" },
      });
    assert.equal((await mark()).status, 200);
    assert.equal((await mark()).status, 200);
    const cash = await activity("payment_updated");
    assert.equal(cash.length, 1, "marking twice is one event");
    assert.match(cash[0].message, /received.*owner@club\.tn/);

    await call("PATCH", `/users/${bob.id}`, { token: admin.token, body: { role: "admin" } });
    await call("PATCH", `/users/${bob.id}`, { token: admin.token, body: { role: "player" } });
    assert.equal((await activity("role_changed")).length, 2);

    await call("PATCH", `/terrains/${courtB}`, {
      token: admin.token,
      body: { isMaintenance: true, maintenanceNote: "Filet" },
    });
    const courts = await activity("court_updated");
    assert.ok(courts.some((c) => /Court B.*isMaintenance/.test(c.message)));
    // A court in maintenance can't be booked
    const refused = await call("POST", "/reservations", {
      token: alice.token,
      body: { terrainId: courtB, startTime: slot("11:00", 2), bookingMode: "own_spot" },
    });
    assert.equal(refused.body.code, "COURT_MAINTENANCE");
    await call("PATCH", `/terrains/${courtB}`, {
      token: admin.token,
      body: { isMaintenance: false },
    });
  });
});

describe("a match stays coherent when a player is taken out", () => {
  let racket: number;
  const booking = (id: number) =>
    q("select status, user_id, notes from reservations where id = $1", [id]).then((r) => r[0]);
  const gear = (reservationId: number) =>
    q("select user_id, status from reservation_equipment where reservation_id = $1 order by id", [
      reservationId,
    ]);

  before(async () => {
    const item = await call("POST", "/admin/equipment", {
      token: admin.token,
      body: { name: "Demo racket", price: 5, stock: 4 },
    });
    assert.equal(item.status, 201);
    racket = item.body.id;
    await credit(alice.id, 4);
    await credit(bob.id, 4);
  });

  test("the admin removes the only player: tokens back, gear released, court free again", async () => {
    const start = slot("08:00", 6);
    const before = await balance(alice.id);
    const r = await call("POST", "/reservations", {
      token: alice.token,
      body: {
        terrainId: courtA,
        startTime: start,
        bookingMode: "own_spot",
        equipment: [{ itemId: racket, quantity: 1 }],
      },
    });
    assert.equal(r.status, 201);
    assert.equal(await balance(alice.id), before - 1);

    const removed = await call(
      "DELETE",
      `/reservations/${r.body.id}/players/${r.body.players[0].id}`,
      {
        token: admin.token,
      },
    );
    assert.equal(removed.status, 200);
    assert.equal(removed.body.refunded, 1);
    assert.equal(removed.body.freed, true, "a member's match left empty is cancelled");
    assert.equal(await balance(alice.id), before);
    assert.equal((await booking(r.body.id)).status, "cancelled");
    assert.deepEqual(
      (await gear(r.body.id)).map((g) => g.status),
      ["cancelled"],
    );

    // The slot can be sold again
    const again = await call("POST", "/reservations", {
      token: bob.token,
      body: { terrainId: courtA, startTime: start, bookingMode: "own_spot" },
    });
    assert.equal(again.status, 201);
  });

  test("the admin removes one of two players: only that player's spot and gear go", async () => {
    const r = await call("POST", "/reservations", {
      token: alice.token,
      body: { terrainId: courtA, startTime: slot("09:30", 6), bookingMode: "own_spot" },
    });
    assert.equal(r.status, 201);
    const joined = await call("POST", `/reservations/${r.body.id}/join`, {
      token: bob.token,
      body: { equipment: [{ itemId: racket, quantity: 2 }] },
    });
    assert.equal(joined.status, 201);
    const before = await balance(bob.id);
    const detail = await call("GET", `/reservations/${r.body.id}`, { token: admin.token });
    const bobSpot = detail.body.players.find((p: { userId: number }) => p.userId === bob.id);

    const removed = await call("DELETE", `/reservations/${r.body.id}/players/${bobSpot.id}`, {
      token: admin.token,
    });
    assert.equal(removed.status, 200);
    assert.equal(removed.body.freed, false);
    assert.equal(await balance(bob.id), before + 1);
    assert.equal((await booking(r.body.id)).status, "confirmed");
    assert.deepEqual(await gear(r.body.id), [{ user_id: bob.id, status: "cancelled" }]);
  });

  test("the organiser removed by the admin hands the match over to the next player", async () => {
    const r = await call("POST", "/reservations", {
      token: alice.token,
      body: { terrainId: courtA, startTime: slot("11:00", 6), bookingMode: "own_spot" },
    });
    await call("POST", `/reservations/${r.body.id}/join`, { token: bob.token });
    const removed = await call(
      "DELETE",
      `/reservations/${r.body.id}/players/${r.body.players[0].id}`,
      {
        token: admin.token,
      },
    );
    assert.equal(removed.status, 200);
    const row = await booking(r.body.id);
    assert.equal(row.status, "confirmed");
    assert.equal(row.user_id, bob.id);
  });

  test("a desk booking for a guest survives its last member leaving", async () => {
    const r = await call("POST", "/reservations", {
      token: admin.token,
      body: {
        terrainId: courtA,
        startTime: slot("12:30", 6),
        bookingMode: "full_court",
        guestName: "Walk-in group",
      },
    });
    assert.equal(r.status, 201);
    const added = await call("POST", `/reservations/${r.body.id}/players`, {
      token: admin.token,
      body: { userId: carol.id },
    });
    assert.equal(added.status, 201);
    const left = await call("DELETE", `/reservations/${r.body.id}/leave`, { token: carol.token });
    assert.equal(left.status, 200);
    assert.equal(left.body.freed, false);
    assert.equal((await booking(r.body.id)).status, "confirmed", "the guest still has the court");
  });

  test("editing a booking never erases notes the request did not send", async () => {
    const r = await call("POST", "/reservations", {
      token: admin.token,
      body: {
        terrainId: courtA,
        startTime: slot("14:00", 6),
        bookingMode: "full_court",
        guestName: "Company event",
        notes: "Bring 8 chairs",
      },
    });
    assert.equal(r.status, 201);
    const untouched = await call("PATCH", `/reservations/${r.body.id}`, {
      token: admin.token,
      body: { status: "confirmed" },
    });
    assert.equal(untouched.status, 200);
    assert.equal((await booking(r.body.id)).notes, "Bring 8 chairs");
    const edited = await call("PATCH", `/reservations/${r.body.id}`, {
      token: admin.token,
      body: { notes: "Bring 10 chairs" },
    });
    assert.equal(edited.body.notes, "Bring 10 chairs");
    const cleared = await call("PATCH", `/reservations/${r.body.id}`, {
      token: admin.token,
      body: { notes: "" },
    });
    assert.equal(cleared.body.notes, null);
    assert.equal(
      (await call("PATCH", "/reservations/999999", { token: admin.token, body: {} })).status,
      404,
    );
  });
});

describe("error contract", () => {
  test("every refusal carries a machine-readable code", async () => {
    const anonymous = await call("GET", "/users/me");
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.code, "UNAUTHORIZED");

    const player = await call("GET", "/users", { token: alice.token });
    assert.equal(player.status, 403);
    assert.equal(player.body.code, "FORBIDDEN");

    const notification = await call("POST", "/notifications/999999/read", { token: alice.token });
    assert.equal(notification.status, 404);
    assert.equal(notification.body.code, "NOT_FOUND");

    const range = await call(
      "GET",
      "/dashboard/occupancy?startDate=2026-02-01&endDate=2026-01-01",
      {
        token: admin.token,
      },
    );
    assert.equal(range.status, 400);
    assert.equal(range.body.code, "VALIDATION_ERROR");

    const cron = await call("POST", "/internal/jobs/run");
    assert.equal(cron.status, 401);
    assert.equal(cron.body.code, "UNAUTHORIZED");

    // An archived court is hidden from players, like in the list
    const court = await call("POST", "/terrains", {
      token: admin.token,
      body: { name: "Old court", type: "outdoor" },
    });
    await call("POST", `/terrains/${court.body.id}/archive`, { token: admin.token });
    assert.equal((await call("GET", `/terrains/${court.body.id}`)).status, 404);
    assert.equal(
      (await call("GET", `/terrains/${court.body.id}`, { token: alice.token })).status,
      404,
    );
    assert.equal(
      (await call("GET", `/terrains/${court.body.id}`, { token: admin.token })).status,
      200,
    );

    const unknown = await call("GET", "/no-such-route");
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.code, "NOT_FOUND");
  });

  test("recurring bookings: unknown member and refused conflicts are clean answers", async () => {
    const start = slot("15:30", 6);
    const ghost = await call("POST", "/admin/series", {
      token: admin.token,
      body: { terrainId: courtA, firstStart: start, occurrences: 2, userId: 999999 },
    });
    assert.equal(ghost.status, 404);
    assert.equal(ghost.body.code, "USER_NOT_FOUND");

    const taken = await call("POST", "/reservations", {
      token: admin.token,
      body: { terrainId: courtA, startTime: start, bookingMode: "full_court", guestName: "Club" },
    });
    assert.equal(taken.status, 201);
    const strict = await call("POST", "/admin/series", {
      token: admin.token,
      body: {
        terrainId: courtA,
        firstStart: start,
        occurrences: 2,
        guestName: "Academy",
        skipConflicts: false,
      },
    });
    assert.equal(strict.status, 409);
    assert.equal(strict.body.code, "SERIES_CONFLICTS");
    assert.equal(
      (await q("select count(*)::int as n from reservation_series where guest_name = 'Academy'"))[0]
        .n,
      0,
      "nothing is created when the admin refuses to skip conflicts",
    );
  });
});
