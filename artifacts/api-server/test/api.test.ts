import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  client,
  createDatabase,
  dropDatabase,
  sign,
  signup,
  slot,
  startApi,
  type Api,
} from "./harness";

let api: Api;
let call: ReturnType<typeof client>;
let admin: { id: number; token: string };
let alice: { id: number; token: string };
let bob: { id: number; token: string };
let carol: { id: number; token: string };
let dave: { id: number; token: string };
let courtA: number;
let courtB: number;

const q = (sql: string, params: unknown[] = []) => api.pool.query(sql, params).then((r) => r.rows);
const balance = async (id: number) =>
  (await q("select token_balance from users where id = $1", [id]))[0].token_balance as number;
const credit = (userId: number, amount: number, idempotencyKey?: string) =>
  call("POST", "/tokens/admin/adjust", {
    token: admin.token,
    body: { userId, type: "credit", amount, description: "Cash at the desk", idempotencyKey },
  });

before(async () => {
  await createDatabase();
  api = await startApi();
  call = client(api.base);
  admin = await signup(api.pool, "owner@club.tn", { first_name: "Club", last_name: "Owner" });
  await q("update users set role = 'admin' where id = $1", [admin.id]);
  alice = await signup(api.pool, "alice@test.tn", { first_name: "Alice", last_name: "Ben Salah" });
  bob = await signup(api.pool, "bob@test.tn", { first_name: "Bob" });
  carol = await signup(api.pool, "carol@test.tn", { first_name: "Carol" });
  dave = await signup(api.pool, "dave@test.tn", { first_name: "Dave" });
  const a = await call("POST", "/terrains", {
    token: admin.token,
    body: { name: "Court A", type: "indoor", openingTime: "08:00", closingTime: "23:00" },
  });
  const b = await call("POST", "/terrains", {
    token: admin.token,
    body: { name: "Court B", type: "outdoor" },
  });
  assert.equal(a.status, 201);
  courtA = a.body.id;
  courtB = b.body.id;
});

after(async () => {
  // The ledger must reconcile after everything the suite did
  const audit = await q("select * from token_ledger_audit");
  assert.deepEqual(audit, [], "token ledger mismatch");
  await api?.close();
  await dropDatabase();
});

describe("auth", () => {
  test("no token, bad signature and expired token are rejected", async () => {
    assert.equal((await call("GET", "/users/me")).status, 401);
    assert.equal(
      (await call("GET", "/users/me", { token: alice.token.slice(0, -2) + "xx" })).status,
      401,
    );
    const expired = sign("00000000-0000-0000-0000-000000000000", "x@test.tn", -10);
    assert.equal((await call("GET", "/users/me", { token: expired })).status, 401);
  });

  test("signup creates the profile with names; sync is idempotent and keeps edits", async () => {
    const me = await call("GET", "/users/me", { token: alice.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.firstName, "Alice");
    assert.equal(me.body.tokenBalance, 0);
    assert.equal(me.body.role, "player");
    await call("PATCH", "/users/me", {
      token: alice.token,
      body: { firstName: "Aly", phone: "+216 20 000 000" },
    });
    const s = await call("POST", "/users/sync", {
      token: alice.token,
      body: { firstName: "Alice" },
    });
    assert.equal(s.status, 200);
    assert.equal(s.body.firstName, "Aly", "sync must not overwrite profile edits");
  });

  test("gender and phone: sync fills them once, profile edits validate them", async () => {
    const s = await call("POST", "/users/sync", {
      token: bob.token,
      body: { phone: "+216 22 111 222", gender: "male" },
    });
    assert.equal(s.status, 200);
    assert.equal(s.body.gender, "male");
    assert.equal(s.body.phone, "+216 22 111 222");
    const again = await call("POST", "/users/sync", {
      token: bob.token,
      body: { phone: "+216 99 999 999", gender: "female" },
    });
    assert.equal(again.body.gender, "male", "sync must not overwrite gender");
    assert.equal(again.body.phone, "+216 22 111 222", "sync must not overwrite phone");
    const bad = await call("PATCH", "/users/me", { token: bob.token, body: { gender: "robot" } });
    assert.equal(bad.status, 400);
    const ok = await call("PATCH", "/users/me", { token: bob.token, body: { gender: "female" } });
    assert.equal(ok.body.gender, "female");
    const cleared = await call("PATCH", "/users/me", { token: bob.token, body: { gender: null } });
    assert.equal(cleared.body.gender, null);
  });

  test("a player cannot make themselves admin or change their balance via the profile", async () => {
    const r = await call("PATCH", "/users/me", {
      token: bob.token,
      body: { role: "admin", tokenBalance: 999 },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.role, "player");
    assert.equal(r.body.tokenBalance, 0);
  });

  test("players are refused on admin endpoints", async () => {
    assert.equal((await call("GET", "/users", { token: bob.token })).status, 403);
    const self = await call("POST", "/tokens/admin/adjust", {
      token: bob.token,
      body: { userId: bob.id, type: "credit", amount: 50, description: "free" },
    });
    assert.equal(self.status, 403);
    assert.equal(await balance(bob.id), 0);
    assert.equal((await call("GET", "/dashboard/stats", { token: bob.token })).status, 403);
  });
});

describe("tokens", () => {
  test("admin credit is recorded in the ledger with the admin", async () => {
    const before = await balance(alice.id);
    const r = await credit(alice.id, 12);
    assert.equal(r.status, 200);
    assert.equal(await balance(alice.id), before + 12);
    const [tx] = await q(
      "select * from token_transactions where user_id = $1 order by id desc limit 1",
      [alice.id],
    );
    assert.equal(tx.type, "credit");
    assert.equal(tx.amount, 12);
    assert.equal(tx.admin_id, admin.id);
    assert.equal(tx.balance_after, before + 12);
  });

  test("the same admin action sent twice credits once (idempotency key)", async () => {
    const before = await balance(carol.id);
    const [r1, r2] = await Promise.all([
      credit(carol.id, 8, "dialog-123"),
      credit(carol.id, 8, "dialog-123"),
    ]);
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(await balance(carol.id), before + 8);
  });

  test("debit can't push a balance below zero", async () => {
    const r = await call("POST", "/tokens/admin/adjust", {
      token: admin.token,
      body: { userId: dave.id, type: "debit", amount: 5, description: "x" },
    });
    assert.equal(r.status, 400);
    assert.equal(await balance(dave.id), 0);
  });

  test("adjustment sets the exact balance and logs the real delta", async () => {
    await credit(dave.id, 3);
    const r = await call("POST", "/tokens/admin/adjust", {
      token: admin.token,
      body: { userId: dave.id, type: "adjustment", amount: 10, description: "Correction" },
    });
    assert.equal(r.status, 200);
    assert.equal(await balance(dave.id), 10);
    assert.equal(r.body.amount, 7);
  });

  test("players only see their own history", async () => {
    const r = await call("GET", "/tokens/transactions", { token: alice.token });
    assert.equal(r.status, 200);
    assert.ok(r.body.data.length > 0);
    assert.ok(r.body.data.every((t: any) => t.userId === alice.id));
  });
});

describe("reservations", () => {
  test("full court costs 4 tokens and debits once", async () => {
    const before = await balance(alice.id);
    const r = await call("POST", "/reservations", {
      token: alice.token,
      body: { terrainId: courtA, startTime: slot("18:30"), bookingMode: "full_court" },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.tokensCharged, 4);
    assert.equal(r.body.players.length, 1);
    assert.equal(r.body.players[0].paymentType, "token");
    assert.equal(await balance(alice.id), before - 4);
  });

  test("the same slot can't be booked twice, and a refused booking costs nothing", async () => {
    const before = await balance(bob.id);
    await credit(bob.id, 4);
    const r = await call("POST", "/reservations", {
      token: bob.token,
      body: { terrainId: courtA, startTime: slot("18:30"), bookingMode: "full_court" },
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, "SLOT_TAKEN");
    assert.equal(await balance(bob.id), before + 4);
  });

  test("times off the 90-minute grid or outside opening hours are refused", async () => {
    let r = await call("POST", "/reservations", {
      token: bob.token,
      body: { terrainId: courtA, startTime: slot("19:00"), bookingMode: "own_spot" },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "INVALID_SLOT");
    r = await call("POST", "/reservations", {
      token: bob.token,
      body: { terrainId: courtA, startTime: slot("06:30"), bookingMode: "own_spot" },
    });
    assert.equal(r.body.code, "OUTSIDE_OPENING_HOURS");
    r = await call("POST", "/reservations", {
      token: bob.token,
      body: { terrainId: courtA, startTime: slot("09:30", -1), bookingMode: "own_spot" },
    });
    assert.equal(r.body.code, "SLOT_IN_PAST");
  });

  test("insufficient balance is refused and leaves no booking behind", async () => {
    const poor = await signup(api.pool, "poor@test.tn");
    await credit(poor.id, 3);
    const r = await call("POST", "/reservations", {
      token: poor.token,
      body: { terrainId: courtB, startTime: slot("08:00"), bookingMode: "full_court" },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "INSUFFICIENT_TOKENS");
    assert.equal(await balance(poor.id), 3);
    const [{ n }] = await q(
      "select count(*)::int n from reservations where terrain_id = $1 and start_time = $2",
      [courtB, slot("08:00")],
    );
    assert.equal(n, 0, "the slot insert was rolled back");
  });

  test("10 players racing for one slot: exactly one wins, only the winner pays", async () => {
    const racers = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        signup(api.pool, `racer${i}@test.tn`, { first_name: `R${i}` }),
      ),
    );
    for (const r of racers) await credit(r.id, 4);
    const results = await Promise.all(
      racers.map((r) =>
        call("POST", "/reservations", {
          token: r.token,
          body: { terrainId: courtB, startTime: slot("20:00", 2), bookingMode: "full_court" },
        }),
      ),
    );
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(results.filter((r) => r.status === 409).length, 9);
    const balances = await Promise.all(racers.map((r) => balance(r.id)));
    assert.equal(balances.filter((b) => b === 0).length, 1);
    assert.equal(balances.filter((b) => b === 4).length, 9);
    const [{ n }] = await q(
      "select count(*)::int n from reservations where terrain_id = $1 and status = 'confirmed' and start_time = $2",
      [courtB, slot("20:00", 2)],
    );
    assert.equal(n, 1);
  });
});

describe("full court: invite friends for free", () => {
  let reservationId: number;
  let token: string;

  test("booker gets one shareable link; friends join free up to 4/4", async () => {
    await credit(bob.id, 4);
    const r = await call("POST", "/reservations", {
      token: bob.token,
      body: { terrainId: courtA, startTime: slot("11:00", 3), bookingMode: "full_court" },
    });
    assert.equal(r.status, 201);
    reservationId = r.body.id;
    const inv = await call("POST", `/reservations/${reservationId}/invite`, { token: bob.token });
    assert.equal(inv.status, 201);
    assert.equal(inv.body.free, true);
    assert.match(inv.body.inviteUrl, /^https:\/\/club\.test\/join\//);
    token = inv.body.token;
    const again = await call("POST", `/reservations/${reservationId}/invite`, { token: bob.token });
    assert.equal(again.body.token, token, "same link reused");

    const preview = await call("GET", `/invites/${token}`);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.reservation.free, true);
    assert.equal(preview.body.reservation.filledSpots, 1);

    const before = await balance(carol.id);
    const acc = await call("POST", `/invites/${token}/accept`, { token: carol.token });
    assert.equal(acc.status, 201, JSON.stringify(acc.body));
    assert.equal(acc.body.paymentType, "invited_free");
    assert.equal(await balance(carol.id), before, "invited friend pays nothing");
  });

  test("accepting twice is refused; joining without the link is refused", async () => {
    assert.equal(
      (await call("POST", `/invites/${token}/accept`, { token: carol.token })).status,
      409,
    );
    const j = await call("POST", `/reservations/${reservationId}/join`, { token: dave.token });
    assert.equal(j.status, 400);
    assert.equal(j.body.code, "PRIVATE_MATCH");
  });

  test("only the booker can hand out spots of a full court", async () => {
    const r = await call("POST", `/reservations/${reservationId}/invite`, { token: carol.token });
    assert.equal(r.status, 403);
  });

  test("5th person is refused when 4/4", async () => {
    const extra = await Promise.all([1, 2, 3].map((i) => signup(api.pool, `friend${i}@test.tn`)));
    const res = await Promise.all(
      extra.map((u) => call("POST", `/invites/${token}/accept`, { token: u.token })),
    );
    assert.equal(res.filter((r) => r.status === 201).length, 2);
    assert.equal(res.filter((r) => r.status === 409).length, 1);
    const [{ n }] = await q(
      "select count(*)::int n from reservation_players where reservation_id = $1",
      [reservationId],
    );
    assert.equal(n, 4);
  });

  test("an invited friend may leave; the booker must cancel instead", async () => {
    const leave = await call("DELETE", `/reservations/${reservationId}/leave`, {
      token: carol.token,
    });
    assert.equal(leave.status, 200);
    assert.equal(leave.body.refunded, 0);
    const bookerLeave = await call("DELETE", `/reservations/${reservationId}/leave`, {
      token: bob.token,
    });
    assert.equal(bookerLeave.body.code, "USE_CANCEL");
  });

  test("cancelling refunds the booker's 4 tokens, once", async () => {
    const before = await balance(bob.id);
    const [c1, c2] = await Promise.all([
      call("POST", `/reservations/${reservationId}/cancel`, { token: bob.token }),
      call("POST", `/reservations/${reservationId}/cancel`, { token: bob.token }),
    ]);
    assert.deepEqual([c1.status, c2.status].sort(), [200, 400]);
    assert.equal(await balance(bob.id), before + 4);
    assert.equal(
      (await call("GET", `/invites/${token}`)).status,
      410,
      "invite dies with the match",
    );
  });
});

describe("own spot: 1/4 → 4/4 with tokens, cash and admin", () => {
  let reservationId: number;

  test("booking my spot costs 1 token and leaves 3 open", async () => {
    await credit(alice.id, 1);
    const before = await balance(alice.id);
    const r = await call("POST", "/reservations", {
      token: alice.token,
      body: {
        terrainId: courtB,
        startTime: slot("17:00", 4),
        bookingMode: "own_spot",
        isPublic: true,
        publicDescription: "Level 3",
      },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    reservationId = r.body.id;
    assert.equal(await balance(alice.id), before - 1);
    const om = await call("GET", "/open-matches");
    const m = om.body.find((x: any) => x.reservationId === reservationId);
    assert.equal(m.openSpots, 3);
    assert.ok(!JSON.stringify(m).includes("@"), "no emails in public data");
  });

  test("a player joins with a token, another reserves to pay cash at the club", async () => {
    await credit(dave.id, 1);
    const d0 = await balance(dave.id);
    const j1 = await call("POST", `/reservations/${reservationId}/join`, {
      token: dave.token,
      body: { paymentMethod: "token" },
    });
    assert.equal(j1.status, 201);
    assert.equal(await balance(dave.id), d0 - 1);
    const c0 = await balance(carol.id);
    const j2 = await call("POST", `/reservations/${reservationId}/join`, {
      token: carol.token,
      body: { paymentMethod: "cash_club" },
    });
    assert.equal(j2.status, 201);
    assert.equal(await balance(carol.id), c0, "cash at the club: no token taken");
    const players = await q(
      "select user_id, payment_type, payment_status from reservation_players where reservation_id = $1 order by id",
      [reservationId],
    );
    assert.deepEqual(
      players.map((p: any) => `${p.payment_type}/${p.payment_status}`),
      ["token/paid", "token/paid", "cash_club/pending"],
    );
  });

  test("calendar: the match's players see payment states, outsiders don't", async () => {
    const date = slot("17:00", 4).slice(0, 10);
    const mine = await call("GET", `/calendar?date=${date}&terrainIds=${courtB}`, {
      token: alice.token,
    });
    const s = mine.body.terrains[0].slots.find((x: any) => x.reservationId === reservationId);
    assert.equal(s.filledSpots, 3);
    assert.equal(s.openSpots, 1);
    assert.equal(s.isMine, true);
    assert.ok(s.players.every((p: any) => p.paymentStatus));
    const anon = await call("GET", `/calendar?date=${date}&terrainIds=${courtB}`);
    const s2 = anon.body.terrains[0].slots.find((x: any) => x.reservationId === reservationId);
    assert.ok(s2.players.every((p: any) => p.paymentStatus === null && p.userId === null));
  });

  test("admin marks cash paid; token spots can't be edited by hand", async () => {
    const [cash] = await q(
      "select id from reservation_players where reservation_id = $1 and payment_type = 'cash_club'",
      [reservationId],
    );
    const [tok] = await q(
      "select id from reservation_players where reservation_id = $1 and payment_type = 'token' limit 1",
      [reservationId],
    );
    const ok = await call("PATCH", `/reservations/${reservationId}/players/${cash.id}`, {
      token: admin.token,
      body: { paymentStatus: "paid" },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.paymentStatus, "paid");
    const no = await call("PATCH", `/reservations/${reservationId}/players/${tok.id}`, {
      token: admin.token,
      body: { paymentStatus: "pending" },
    });
    assert.equal(no.status, 400);
    const player = await call("PATCH", `/reservations/${reservationId}/players/${cash.id}`, {
      token: carol.token,
      body: { paymentStatus: "paid" },
    });
    assert.equal(player.status, 403, "players can't mark themselves paid");
  });

  test("admin adds the 4th player; a 5th is refused", async () => {
    const eve = await signup(api.pool, "eve@test.tn", { first_name: "Eve" });
    const add = await call("POST", `/reservations/${reservationId}/players`, {
      token: admin.token,
      body: { userId: eve.id, paymentType: "cash_club" },
    });
    assert.equal(add.status, 201);
    const fred = await signup(api.pool, "fred@test.tn");
    await credit(fred.id, 1);
    const late = await call("POST", `/reservations/${reservationId}/join`, { token: fred.token });
    assert.equal(late.status, 409);
    assert.equal(await balance(fred.id), 1, "refused join costs nothing");
  });

  test("leaving refunds a token spot; the organiser role passes on", async () => {
    const before = await balance(alice.id);
    const r = await call("DELETE", `/reservations/${reservationId}/leave`, { token: alice.token });
    assert.equal(r.status, 200);
    assert.equal(r.body.refunded, 1);
    assert.equal(await balance(alice.id), before + 1);
    const [res] = await q("select user_id, status from reservations where id = $1", [
      reservationId,
    ]);
    assert.equal(res.status, "confirmed");
    assert.notEqual(res.user_id, alice.id);
  });

  test("only the organiser or admin may cancel the whole match", async () => {
    const r = await call("POST", `/reservations/${reservationId}/cancel`, { token: alice.token });
    assert.equal(r.status, 403);
  });

  test("admin cancellation refunds every token payer", async () => {
    const before = await balance(dave.id);
    const r = await call("POST", `/reservations/${reservationId}/cancel`, { token: admin.token });
    assert.equal(r.status, 200);
    assert.equal(await balance(dave.id), before + 1);
    const rows = await q(
      "select payment_type, payment_status from reservation_players where reservation_id = $1",
      [reservationId],
    );
    assert.ok(
      rows
        .filter((p: any) => p.payment_type === "token")
        .every((p: any) => p.payment_status === "refunded"),
    );
  });

  test("the last player leaving an own-spot match frees the court", async () => {
    await credit(bob.id, 1);
    const r = await call("POST", "/reservations", {
      token: bob.token,
      body: { terrainId: courtA, startTime: slot("14:00", 5), bookingMode: "own_spot" },
    });
    const l = await call("DELETE", `/reservations/${r.body.id}/leave`, { token: bob.token });
    assert.equal(l.body.freed, true);
    const again = await call("POST", "/reservations", {
      token: bob.token,
      body: { terrainId: courtA, startTime: slot("14:00", 5), bookingMode: "own_spot" },
    });
    assert.equal(again.status, 201, "slot is bookable again");
  });
});

describe("admin desk", () => {
  test("phone booking for a guest, then the slot is taken", async () => {
    const r = await call("POST", "/reservations", {
      token: admin.token,
      body: {
        terrainId: courtA,
        startTime: slot("21:30", 2),
        bookingMode: "full_court",
        guestName: "Sami (phone)",
        guestPhone: "+216 22 111 222",
        bookingType: "phone",
      },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.bookingType, "phone");
    assert.equal(r.body.userId, null);
    const date = slot("21:30", 2).slice(0, 10);
    const cal = await call("GET", `/calendar?date=${date}&terrainIds=${courtA}`, {
      token: bob.token,
    });
    const s = cal.body.terrains[0].slots.find((x: any) => x.reservationId === r.body.id);
    assert.equal(s.status, "full");
    assert.equal(s.guestPhone, null, "guest phone hidden from players");
  });

  test("member booking paid cash at the desk takes no tokens", async () => {
    const before = await balance(dave.id);
    const r = await call("POST", "/reservations", {
      token: admin.token,
      body: {
        terrainId: courtA,
        startTime: slot("08:00", 6),
        bookingMode: "full_court",
        userId: dave.id,
        paymentMethod: "cash_club",
      },
    });
    assert.equal(r.status, 201);
    assert.equal(await balance(dave.id), before);
    assert.equal(r.body.players[0].paymentType, "cash_club");
    assert.equal(r.body.players[0].paymentStatus, "pending");
  });

  test("admin can't silently cancel through PATCH (no refund path)", async () => {
    const [r] = await q("select id from reservations where status = 'confirmed' limit 1");
    const p = await call("PATCH", `/reservations/${r.id}`, {
      token: admin.token,
      body: { status: "cancelled" },
    });
    assert.equal(p.status, 400);
  });

  test("players can't cancel a match that already started", async () => {
    await credit(carol.id, 1);
    // Book in the future, then move it to the past directly in the DB
    const r = await call("POST", "/reservations", {
      token: carol.token,
      body: { terrainId: courtB, startTime: slot("09:30", 7), bookingMode: "own_spot" },
    });
    await q(
      "update reservations set start_time = now() - interval '10 minutes', end_time = now() + interval '80 minutes' where id = $1",
      [r.body.id],
    );
    const c = await call("POST", `/reservations/${r.body.id}/cancel`, { token: carol.token });
    assert.equal(c.status, 400);
    assert.equal(c.body.code, "CANCELLATION_CLOSED");
  });

  test("role management keeps at least one admin", async () => {
    const self = await call("PATCH", `/users/${admin.id}`, {
      token: admin.token,
      body: { role: "player" },
    });
    assert.equal(self.body.code, "SELF_DEMOTE");
    const promote = await call("PATCH", `/users/${bob.id}`, {
      token: admin.token,
      body: { role: "admin" },
    });
    assert.equal(promote.body.role, "admin");
    const demote = await call("PATCH", `/users/${bob.id}`, {
      token: admin.token,
      body: { role: "player" },
    });
    assert.equal(demote.body.role, "player");
  });

  test("a court with history can't be deleted", async () => {
    const r = await call("DELETE", `/terrains/${courtA}`, { token: admin.token });
    assert.equal(r.status, 409);
  });

  test("dashboard stats are computed from real courts", async () => {
    const r = await call("GET", "/dashboard/stats", { token: admin.token });
    assert.equal(r.status, 200);
    assert.equal(r.body.slotsPerDay, 20); // 2 courts × 10 slots (08:00–23:00)
  });

  test("tournament registration: once, only while open, never above max", async () => {
    const t = await call("POST", "/tournaments", {
      token: admin.token,
      body: { name: "Open d'automne", startDate: slot("09:30", 10), maxTeams: 2, status: "open" },
    });
    assert.equal(t.status, 201);
    assert.equal(
      (await call("POST", `/tournaments/${t.body.id}/register`, { token: alice.token })).status,
      201,
    );
    assert.equal(
      (await call("POST", `/tournaments/${t.body.id}/register`, { token: alice.token })).status,
      409,
    );
    assert.equal(
      (await call("POST", `/tournaments/${t.body.id}/register`, { token: bob.token })).status,
      201,
    );
    assert.equal(
      (await call("POST", `/tournaments/${t.body.id}/register`, { token: carol.token })).body.code,
      "TOURNAMENT_FULL",
    );
  });

  test("unknown routes and bad input get clean JSON errors", async () => {
    const r = await call("GET", "/nope");
    assert.equal(r.status, 404);
    assert.equal(r.body.code, "NOT_FOUND");
    const bad = await call("GET", "/reservations/abc", { token: alice.token });
    assert.equal(bad.status, 400);
  });
});
