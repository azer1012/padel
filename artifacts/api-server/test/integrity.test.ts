import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { client, createDatabase, dropDatabase, signup, slot, startApi, type Api } from "./harness";

let api: Api;
let call: ReturnType<typeof client>;
type Member = { id: number; token: string; authId: string };
let admin: Member, second: Member, alice: Member, bob: Member;
let court: number;

const q = (sql: string, params: unknown[] = []) => api.pool.query(sql, params).then((r) => r.rows);
const balance = async (id: number) =>
  (await q("select token_balance from users where id = $1", [id]))[0].token_balance as number;
const credit = (userId: number, amount: number) =>
  call("POST", "/tokens/admin/adjust", {
    token: admin.token,
    body: { userId, type: "credit", amount, description: "Cash at the desk" },
  });
const ledger = (userId: number, type: string) =>
  q("select amount from token_transactions where user_id = $1 and type = $2", [userId, type]);

before(async () => {
  await createDatabase();
  api = await startApi();
  call = client(api.base);
  admin = await signup(api.pool, "owner@club.tn", { first_name: "Club", last_name: "Owner" });
  second = await signup(api.pool, "desk@club.tn", { first_name: "Front", last_name: "Desk" });
  await q("update users set role = 'admin' where id = any($1)", [[admin.id, second.id]]);
  alice = await signup(api.pool, "alice@test.tn", { first_name: "Alice" });
  bob = await signup(api.pool, "bob@test.tn", { first_name: "Bob" });
  const c = await call("POST", "/terrains", {
    token: admin.token,
    body: { name: "Court A", type: "indoor" },
  });
  court = c.body.id;
});

after(async () => {
  const audit = await q("select * from token_ledger_audit");
  assert.deepEqual(audit, [], "token ledger mismatch");
  await api?.close();
  await dropDatabase();
});

describe("a request repeated at the same instant", () => {
  test("the same booking sent 8 times books once and debits once", async () => {
    await credit(alice.id, 8);
    const body = { terrainId: court, startTime: slot("08:00", 2), bookingMode: "full_court" };
    const answers = await Promise.all(
      Array.from({ length: 8 }, () => call("POST", "/reservations", { token: alice.token, body })),
    );
    assert.equal(answers.filter((a) => a.status === 201).length, 1);
    for (const a of answers.filter((a) => a.status !== 201)) {
      assert.equal(a.status, 409);
      assert.equal(a.body.code, "SLOT_TAKEN");
    }
    assert.equal(await balance(alice.id), 4);
    assert.equal((await ledger(alice.id, "debit")).length, 1);
    const rows = await q(
      "select count(*)::int as n from reservations where user_id = $1 and status = 'confirmed'",
      [alice.id],
    );
    assert.equal(rows[0].n, 1);
  });

  test("the same cancellation sent 8 times refunds once", async () => {
    const [{ id }] = await q(
      "select id from reservations where user_id = $1 and status = 'confirmed'",
      [alice.id],
    );
    const answers = await Promise.all(
      Array.from({ length: 8 }, () =>
        call("POST", `/reservations/${id}/cancel`, { token: alice.token }),
      ),
    );
    assert.equal(answers.filter((a) => a.status === 200).length, 1);
    for (const a of answers.filter((a) => a.status !== 200))
      assert.equal(a.body.code, "ALREADY_CANCELLED");
    assert.equal(await balance(alice.id), 8);
    // 1 desk credit + exactly 1 refund
    assert.equal((await ledger(alice.id, "credit")).length, 2);
  });

  test("leaving a match 6 times at once refunds the spot once", async () => {
    await credit(bob.id, 2);
    const match = await call("POST", "/reservations", {
      token: alice.token,
      body: { terrainId: court, startTime: slot("09:30", 2), bookingMode: "own_spot" },
    });
    assert.equal(match.status, 201);
    const join = await call("POST", `/reservations/${match.body.id}/join`, { token: bob.token });
    assert.equal(join.status, 201);
    assert.equal(await balance(bob.id), 1);
    const answers = await Promise.all(
      Array.from({ length: 6 }, () =>
        call("DELETE", `/reservations/${match.body.id}/leave`, { token: bob.token }),
      ),
    );
    assert.equal(answers.filter((a) => a.status === 200).length, 1);
    assert.equal(await balance(bob.id), 2);
  });
});

describe("what the browser sends is never the authority", () => {
  test("a player's price, payer, owner and payment fields are ignored", async () => {
    const before = await balance(alice.id);
    const r = await call("POST", "/reservations", {
      token: alice.token,
      body: {
        terrainId: court,
        startTime: slot("11:00", 2),
        bookingMode: "full_court",
        // none of these may change who pays, or how much
        userId: bob.id,
        tokensCharged: 0,
        price: 0,
        paymentMethod: "cash_club",
        paymentStatus: "paid",
        totalSpots: 40,
        status: "confirmed",
        role: "admin",
        guestName: "Free rider",
      },
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.userId, alice.id);
    assert.equal(r.body.tokensCharged, 4);
    assert.equal(r.body.totalSpots, 4);
    assert.equal(r.body.guestName, null);
    assert.equal(await balance(alice.id), before - 4);
    assert.equal(r.body.players[0].paymentType, "token");
    assert.equal((await q("select role from users where id = $1", [alice.id]))[0].role, "player");
  });

  test("forged access tokens are refused: no signature, wrong audience, no subject", async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const hs256 = (claims: object) => {
      const head = b64({ alg: "HS256", typ: "JWT" });
      const body = b64(claims);
      const sig = crypto
        .createHmac("sha256", "test-jwt-secret-at-least-32-characters-long")
        .update(`${head}.${body}`)
        .digest("base64url");
      return `${head}.${body}.${sig}`;
    };
    const forged = [
      // "alg: none" with the admin's id
      `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: admin.authId, aud: "authenticated", exp })}.`,
      // correctly signed, but a key of the project (anon / service role), not a member's session
      hs256({ role: "service_role", iss: "supabase", exp }),
      hs256({ sub: admin.authId, aud: "anon", exp }),
      // signed with another secret
      `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: admin.authId, aud: "authenticated", exp })}.${crypto
        .createHmac("sha256", "another-secret")
        .update("x")
        .digest("base64url")}`,
    ];
    for (const token of forged) {
      const me = await call("GET", "/users/me", { token });
      assert.equal(me.status, 401, token.slice(0, 40));
      const users = await call("GET", "/users", { token });
      assert.equal(users.status, 401);
    }
  });
});

describe("tokens never expire", () => {
  test("a credit with an expiry date is refused instead of promising what nothing enforces", async () => {
    const before = await balance(bob.id);
    const r = await call("POST", "/tokens/admin/adjust", {
      token: admin.token,
      body: {
        userId: bob.id,
        type: "credit",
        amount: 5,
        description: "Promo",
        expiresAt: "2030-01-01T00:00:00Z",
      },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "VALIDATION_ERROR");
    assert.equal(await balance(bob.id), before);
    const wallet = await call("GET", "/tokens/balance", { token: bob.token });
    assert.deepEqual(Object.keys(wallet.body).sort(), ["balance", "userId"]);
  });
});

describe("the club always keeps an admin", () => {
  test("two admins removing each other at the same instant: one is refused", async () => {
    const [a, b] = await Promise.all([
      call("PATCH", `/users/${second.id}`, { token: admin.token, body: { role: "player" } }),
      call("PATCH", `/users/${admin.id}`, { token: second.token, body: { role: "player" } }),
    ]);
    const statuses = [a.status, b.status].sort();
    // The loser is refused either as the last admin (400) or because the winner
    // already took their admin access away (403)
    assert.equal(statuses[0], 200);
    assert.ok([400, 403].includes(statuses[1]), `second answer was ${statuses[1]}`);
    const admins = await q("select count(*)::int as n from users where role = 'admin'");
    assert.equal(admins[0].n, 1);
  });
});
