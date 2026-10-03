/**
 * Members' accounts and the desk's cash: a member blocked by the club, a member who
 * deletes their own account, and the cash report built from what the desk recorded.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { client, createDatabase, dropDatabase, signup, slot, startApi, type Api } from "./harness";

let api: Api;
let call: ReturnType<typeof client>;
type Member = { id: number; token: string; authId: string };
let admin: Member, alice: Member, bob: Member, carol: Member;
let court: number;

const q = (sql: string, params: unknown[] = []) => api.pool.query(sql, params).then((r) => r.rows);
const credit = (userId: number, amount: number, extra: Record<string, unknown> = {}) =>
  call("POST", "/tokens/admin/adjust", {
    token: admin.token,
    body: { userId, type: "credit", amount, description: "Cash at the desk", ...extra },
  });
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Tunis" });

before(async () => {
  await createDatabase();
  api = await startApi();
  call = client(api.base);
  admin = await signup(api.pool, "owner@club.tn", { first_name: "Club", last_name: "Owner" });
  await q("update users set role = 'admin' where id = $1", [admin.id]);
  alice = await signup(api.pool, "alice@test.tn", {
    first_name: "Alice",
    last_name: "Ben Salah",
    phone: "+216 20 111 222",
  });
  bob = await signup(api.pool, "bob@test.tn", { first_name: "Bob", phone: "+216 20 333 444" });
  carol = await signup(api.pool, "carol@test.tn", { first_name: "Carol" });
  const c = await call("POST", "/terrains", {
    token: admin.token,
    body: { name: "Court A", type: "indoor" },
  });
  court = c.body.id;
});

after(async () => {
  assert.deepEqual(await q("select * from token_ledger_audit"), [], "token ledger mismatch");
  await api?.close();
  await dropDatabase();
});

describe("a member blocked by the club", () => {
  test("only an admin blocks; never themselves, never another admin", async () => {
    const player = await call("PATCH", `/users/${bob.id}`, {
      token: alice.token,
      body: { blocked: true },
    });
    assert.equal(player.status, 403);
    const self = await call("PATCH", `/users/${admin.id}`, {
      token: admin.token,
      body: { blocked: true },
    });
    assert.equal(self.body.code, "SELF_BLOCK");
    await q("update users set role = 'admin' where id = $1", [carol.id]);
    const other = await call("PATCH", `/users/${carol.id}`, {
      token: admin.token,
      body: { blocked: true },
    });
    assert.equal(other.body.code, "ADMIN_NOT_BLOCKABLE");
    await q("update users set role = 'player' where id = $1", [carol.id]);
  });

  test("blocked: the API is closed to them, the public pages are not; their tokens stay", async () => {
    await credit(bob.id, 4);
    const blocked = await call("PATCH", `/users/${bob.id}`, {
      token: admin.token,
      body: { blocked: true, blockedReason: "Impayés répétés" },
    });
    assert.equal(blocked.status, 200);
    assert.ok(blocked.body.blockedAt);
    assert.equal(blocked.body.blockedReason, "Impayés répétés");

    for (const [method, path, body] of [
      ["GET", "/users/me", undefined],
      ["GET", "/tokens/balance", undefined],
      [
        "POST",
        "/reservations",
        { terrainId: court, startTime: slot("09:30", 2), bookingMode: "full_court" },
      ],
      ["POST", "/shop/orders", { items: [] }],
      ["POST", "/users/sync", {}],
    ] as const) {
      const r = await call(method, path, { token: bob.token, body });
      assert.equal(r.status, 403, `${method} ${path}`);
      assert.equal(r.body.code, "ACCOUNT_BLOCKED", `${method} ${path}`);
    }
    // Like any visitor on the public pages
    assert.equal((await call("GET", "/terrains", { token: bob.token })).status, 200);
    assert.equal((await call("GET", "/settings", { token: bob.token })).status, 200);
    assert.equal(
      (await q("select token_balance from users where id = $1", [bob.id]))[0].token_balance,
      4,
    );
    // Nobody invites them while they are blocked
    const found = await call("GET", "/members/search?q=Bob", { token: alice.token });
    assert.deepEqual(found.body, []);
    const [entry] = await q(
      "select message from activity where type = 'member_updated' and user_id = $1",
      [bob.id],
    );
    assert.match(entry.message, /bob@test\.tn blocked: Impayés répétés \(by owner@club\.tn\)/);
  });

  test("a blocked member is not made admin; unblocked, everything works again", async () => {
    const promote = await call("PATCH", `/users/${bob.id}`, {
      token: admin.token,
      body: { role: "admin" },
    });
    assert.equal(promote.body.code, "BLOCKED_MEMBER");
    const back = await call("PATCH", `/users/${bob.id}`, {
      token: admin.token,
      body: { blocked: false },
    });
    assert.equal(back.body.blockedAt, null);
    assert.equal(back.body.blockedReason, null);
    assert.equal((await call("GET", "/users/me", { token: bob.token })).status, 200);
  });
});

describe("the cash report", () => {
  let match: number;

  test("what the desk takes is dated: tokens sold, a spot paid at the club, an order handed over", async () => {
    // Tokens sold for cash (a gift carries no cash and is not in the report)
    assert.equal((await credit(alice.id, 10, { cashAmount: 250 })).status, 200);
    assert.equal((await credit(alice.id, 2, { description: "Geste commercial" })).status, 200);

    // A spot paid at the club, marked by the desk
    const r = await call("POST", "/reservations", {
      token: alice.token,
      body: { terrainId: court, startTime: slot("11:00", 2), bookingMode: "own_spot" },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    match = r.body.id;
    const join = await call("POST", `/reservations/${match}/join`, {
      token: bob.token,
      body: { paymentMethod: "cash_club" },
    });
    assert.equal(join.status, 201, JSON.stringify(join.body));
    const [spot] = await q(
      "select id from reservation_players where reservation_id = $1 and user_id = $2",
      [match, bob.id],
    );
    const paid = await call("PATCH", `/reservations/${match}/players/${spot.id}`, {
      token: admin.token,
      body: { paymentStatus: "paid" },
    });
    assert.equal(paid.status, 200);
    assert.equal(paid.body.cashAmount, 25, "the club's price per player");
    assert.equal(paid.body.paidBy, admin.id);
    assert.ok(paid.body.paidAt);

    // A boutique order handed over and paid
    const product = await call("POST", "/admin/shop/products", {
      token: admin.token,
      body: { name: "Tube de 3 balles", category: "balls", price: 18, stock: 10 },
    });
    const order = await call("POST", "/shop/orders", {
      token: alice.token,
      body: { deliveryMethod: "pickup", items: [{ productId: product.body.id, quantity: 2 }] },
    });
    for (const status of ["confirmed", "delivered"])
      await call("PATCH", `/admin/shop/orders/${order.body.id}`, {
        token: admin.token,
        body: { status },
      });

    const report = await call("GET", `/admin/reports/cash?from=${today()}&to=${today()}`, {
      token: admin.token,
    });
    assert.equal(report.status, 200);
    assert.deepEqual(report.body.totals, {
      tokens: 250,
      spots: 25,
      orders: 36,
      total: 311,
      online: 0,
    });
    assert.equal(report.body.currency, "TND");
    assert.equal(report.body.lines.length, 3);
    const byKind = Object.fromEntries(report.body.lines.map((l: any) => [l.kind, l]));
    assert.equal(byKind.tokens.member, "Alice Ben Salah");
    assert.equal(byKind.tokens.operator, "Club Owner");
    assert.match(byKind.tokens.label, /^10 token\(s\) · Cash at the desk$/);
    assert.equal(byKind.spot.member, "Bob");
    assert.match(byKind.spot.label, /^Court A · \d\d\/\d\d\/\d{4} 11:00$/);
    assert.equal(byKind.order.amount, 36);
  });

  test("the desk may say it took another amount; a payment un-marked leaves the report", async () => {
    const [spot] = await q(
      "select id from reservation_players where reservation_id = $1 and user_id = $2",
      [match, bob.id],
    );
    const path = `/reservations/${match}/players/${spot.id}`;
    await call("PATCH", path, { token: admin.token, body: { paymentStatus: "pending" } });
    let report = await call("GET", "/admin/reports/cash", { token: admin.token });
    assert.equal(report.body.totals.spots, 0);
    const [cleared] = await q(
      "select cash_amount, paid_at, paid_by from reservation_players where id = $1",
      [spot.id],
    );
    assert.deepEqual(cleared, { cash_amount: null, paid_at: null, paid_by: null });

    const bad = await call("PATCH", path, {
      token: admin.token,
      body: { paymentStatus: "paid", cashAmount: -5 },
    });
    assert.equal(bad.status, 400);
    const other = await call("PATCH", path, {
      token: admin.token,
      body: { paymentStatus: "paid", cashAmount: 20 },
    });
    assert.equal(other.body.cashAmount, 20);
    report = await call("GET", "/admin/reports/cash", { token: admin.token });
    assert.equal(report.body.totals.spots, 20);
  });

  test("another day holds nothing; a range is checked; players never read it", async () => {
    const empty = await call("GET", "/admin/reports/cash?from=2020-01-01&to=2020-01-02", {
      token: admin.token,
    });
    assert.deepEqual(empty.body.totals, { tokens: 0, spots: 0, orders: 0, total: 0, online: 0 });
    assert.deepEqual(empty.body.lines, []);
    const backwards = await call("GET", "/admin/reports/cash?from=2026-02-01&to=2026-01-01", {
      token: admin.token,
    });
    assert.equal(backwards.status, 400);
    assert.equal((await call("GET", "/admin/reports/cash", { token: alice.token })).status, 403);
    assert.equal((await call("GET", "/admin/reports/cash")).status, 401);
  });
});

describe("a member deletes their own account", () => {
  test("nothing by accident: it must be confirmed, and never by anyone else", async () => {
    const bare = await call("DELETE", "/users/me", { token: alice.token, body: {} });
    assert.equal(bare.body.code, "CONFIRMATION_REQUIRED");
    assert.equal((await call("DELETE", "/users/me", { body: { confirm: true } })).status, 401);
    // There is no route to delete somebody else
    const other = await call("DELETE", `/users/${alice.id}`, {
      token: bob.token,
      body: { confirm: true },
    });
    assert.equal(other.status, 404);
  });

  test("refused while a match is to come or an order is in progress", async () => {
    // Alice organises the match of the cash report, Bob has a spot in it
    for (const who of [alice, bob]) {
      const r = await call("DELETE", "/users/me", {
        token: who.token,
        body: { confirm: true, forfeitTokens: 999 },
      });
      assert.equal(r.status, 409);
      assert.equal(r.body.code, "HAS_UPCOMING_BOOKINGS");
    }
    await credit(carol.id, 3);
    const product = await call("POST", "/admin/shop/products", {
      token: admin.token,
      body: { name: "Surgrip", category: "accessory", price: 5, stock: 10 },
    });
    const order = await call("POST", "/shop/orders", {
      token: carol.token,
      body: {
        deliveryMethod: "pickup",
        contactPhone: "+216 22 000 111",
        items: [{ productId: product.body.id, quantity: 1 }],
      },
    });
    assert.equal(order.status, 201);
    const waiting = await call("DELETE", "/users/me", {
      token: carol.token,
      body: { confirm: true, forfeitTokens: 3 },
    });
    assert.equal(waiting.body.code, "HAS_OPEN_ORDERS");
    await call("PATCH", `/admin/shop/orders/${order.body.id}`, {
      token: admin.token,
      body: { status: "cancelled" },
    });
  });

  test("the tokens given up must be the ones the member saw", async () => {
    const none = await call("DELETE", "/users/me", {
      token: carol.token,
      body: { confirm: true },
    });
    assert.equal(none.status, 409);
    assert.equal(none.body.code, "TOKENS_LEFT");
    assert.equal(none.body.details.tokens, 3);
    const stale = await call("DELETE", "/users/me", {
      token: carol.token,
      body: { confirm: true, forfeitTokens: 2 },
    });
    assert.equal(stale.body.code, "TOKENS_LEFT");
    assert.equal(
      (await q("select deleted_at from users where id = $1", [carol.id]))[0].deleted_at,
      null,
    );
  });

  test("deleted: nothing personal is left, the tokens are written off, the sign-in is gone", async () => {
    await call("POST", "/tournaments", {
      token: admin.token,
      body: { name: "Open", startDate: slot("09:30", 10), maxTeams: 8, status: "open" },
    });
    const [t] = await q("select id from tournaments where name = 'Open'");
    await call("POST", `/tournaments/${t.id}/register`, {
      token: carol.token,
      body: { teamName: "Carol & Dave" },
    });

    const gone = await call("DELETE", "/users/me", {
      token: carol.token,
      body: { confirm: true, forfeitTokens: 3 },
    });
    assert.equal(gone.status, 204);

    const [row] = await q("select * from users where id = $1", [carol.id]);
    assert.equal(row.email, `deleted-${carol.id}@deleted.invalid`);
    assert.equal(row.first_name, null);
    assert.equal(row.phone, null);
    assert.equal(row.token_balance, 0);
    assert.ok(row.deleted_at);
    assert.equal(row.supabase_auth_id, `deleted:${carol.authId}`);
    assert.deepEqual(await q("select id from auth.users where id = $1", [carol.authId]), []);
    const [last] = await q(
      "select type, amount, description from token_transactions where user_id = $1 order by id desc limit 1",
      [carol.id],
    );
    assert.deepEqual(last, { type: "debit", amount: 3, description: "Account deleted" });
    // Their team left the tournament, their past order no longer names them
    assert.equal(
      (await q("select registered_teams from tournaments where id = $1", [t.id]))[0]
        .registered_teams,
      0,
    );
    const [order] = await q(
      "select contact_name, contact_phone from shop_orders where user_id = $1",
      [carol.id],
    );
    assert.deepEqual(order, { contact_name: "—", contact_phone: "—" });
    assert.deepEqual(
      await q("select id from activity where message like '%carol@test.tn%'"),
      [],
      "the audit trail no longer holds the address",
    );

    // The session still open is of no use, and cannot bring the account back
    assert.equal((await call("GET", "/users/me", { token: carol.token })).status, 401);
    const sync = await call("POST", "/users/sync", { token: carol.token, body: {} });
    assert.equal(sync.status, 403);
    assert.equal(sync.body.code, "ACCOUNT_DELETED");
    // The desk no longer lists it
    const members = await call("GET", "/users?search=deleted", { token: admin.token });
    assert.deepEqual(members.body.data, []);
  });

  test("the same address can sign up again, as somebody new", async () => {
    const again = await signup(api.pool, "carol@test.tn", { first_name: "Carol" });
    assert.notEqual(again.id, carol.id);
    const me = await call("GET", "/users/me", { token: again.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.tokenBalance, 0);
  });

  test("the club's last admin cannot delete their account", async () => {
    const r = await call("DELETE", "/users/me", {
      token: admin.token,
      body: { confirm: true, forfeitTokens: 0 },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "LAST_ADMIN");
  });
});
