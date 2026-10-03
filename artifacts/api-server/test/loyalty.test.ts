import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { client, createDatabase, dropDatabase, signup, slot, startApi, type Api } from "./harness";

let api: Api;
let call: ReturnType<typeof client>;
type Member = { id: number; token: string };
let admin: Member, alice: Member, bob: Member;
let court: number;

const q = (sql: string, params: unknown[] = []) => api.pool.query(sql, params).then((r) => r.rows);
const wallet = async (id: number) =>
  (await q("select token_balance from users where id = $1", [id]))[0].token_balance as number;
const loyalty = async (id: number) =>
  Number((await q("select loyalty_balance from users where id = $1", [id]))[0].loyalty_balance);
const credit = (userId: number, amount: number) =>
  call("POST", "/tokens/admin/adjust", {
    token: admin.token,
    body: { userId, type: "credit", amount, description: "Cash at the desk" },
  });
const settings = (body: Record<string, unknown>) =>
  call("PATCH", "/admin/settings", { token: admin.token, body });
const book = (who: Member, hhmm: string, days: number, extra: Record<string, unknown> = {}) =>
  call("POST", "/reservations", {
    token: who.token,
    body: { terrainId: court, startTime: slot(hhmm, days), bookingMode: "full_court", ...extra },
  });
const rewards = (id: number) =>
  q("select amount from token_transactions where user_id = $1 and description = 'Loyalty reward'", [
    id,
  ]);

before(async () => {
  await createDatabase();
  api = await startApi();
  call = client(api.base);
  admin = await signup(api.pool, "owner@club.tn", { first_name: "Club", last_name: "Owner" });
  await q("update users set role = 'admin' where id = $1", [admin.id]);
  alice = await signup(api.pool, "alice@test.tn", { first_name: "Alice" });
  bob = await signup(api.pool, "bob@test.tn", { first_name: "Bob" });
  const c = await call("POST", "/terrains", {
    token: admin.token,
    body: { name: "Court A", type: "indoor" },
  });
  court = c.body.id;
  await credit(alice.id, 40);
  await credit(bob.id, 10);
});

after(async () => {
  assert.deepEqual(await q("select * from token_ledger_audit"), [], "token ledger mismatch");
  await api?.close();
  await dropDatabase();
});

describe("the club's rule", () => {
  test("off by default: a booking earns nothing, and visitors are told it is off", async () => {
    const rules = await call("GET", "/settings");
    assert.equal(rules.body.loyaltyEnabled, false);
    assert.equal(rules.body.loyaltySpendTokens, 1);
    assert.equal(rules.body.loyaltyRewardTokens, 0.1);
    const r = await book(alice, "08:00", 2);
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.loyalty, { earned: 0, credited: 0 });
    assert.equal(await loyalty(alice.id), 0);
    assert.equal(await wallet(alice.id), 36);
  });

  test("only an admin sets it, within sensible values", async () => {
    const player = await call("PATCH", "/admin/settings", {
      token: alice.token,
      body: { loyaltyEnabled: true, loyaltyRewardTokens: 50 },
    });
    assert.equal(player.status, 403);
    for (const body of [
      { loyaltyRewardTokens: 0 },
      { loyaltyRewardTokens: -1 },
      { loyaltyRewardTokens: 0.123 },
      { loyaltyRewardTokens: 101 },
      { loyaltySpendTokens: 0 },
      { loyaltySpendTokens: 1.5 },
      { loyaltyEnabled: "yes" },
    ]) {
      const bad = await settings(body);
      assert.equal(bad.status, 400, JSON.stringify(body));
    }
    const ok = await settings({
      loyaltyEnabled: true,
      loyaltySpendTokens: 1,
      loyaltyRewardTokens: 0.1,
    });
    assert.equal(ok.status, 200);
    assert.equal((await call("GET", "/settings")).body.loyaltyEnabled, true);
  });
});

describe("earning", () => {
  test("a full court (4 tokens) at 0.1 per token earns 0.4, kept as a fraction", async () => {
    const r = await book(alice, "09:30", 2);
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.loyalty, { earned: 0.4, credited: 0 });
    assert.equal(r.body.players[0].loyaltyEarned, 0.4);
    assert.equal(await loyalty(alice.id), 0.4);
    assert.equal(await wallet(alice.id), 32, "no token yet");
    assert.equal((await rewards(alice.id)).length, 0);
  });

  test("reaching a whole token credits it to the wallet through the ledger", async () => {
    await book(alice, "11:00", 2); // 0.8
    const r = await book(alice, "12:30", 2); // 1.2 → 1 token + 0.2
    assert.deepEqual(r.body.loyalty, { earned: 0.4, credited: 1 });
    assert.equal(await loyalty(alice.id), 0.2);
    // 32 − 4 − 4 + 1 reward
    assert.equal(await wallet(alice.id), 25);
    const ledger = await rewards(alice.id);
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].amount, 1);
    const me = await call("GET", "/users/me", { token: alice.token });
    assert.equal(me.body.loyaltyBalance, 0.2);
    assert.equal(me.body.tokenBalance, 25);
  });

  test("joining a match with a token earns too; paying at the club or a free invited spot does not", async () => {
    const match = await book(alice, "14:00", 2, { bookingMode: "own_spot", isPublic: true });
    assert.equal(match.status, 201);
    assert.deepEqual(match.body.loyalty, { earned: 0.1, credited: 0 });
    const before = await loyalty(bob.id);
    const join = await call("POST", `/reservations/${match.body.id}/join`, { token: bob.token });
    assert.equal(join.status, 201);
    assert.equal(await loyalty(bob.id), Math.round((before + 0.1) * 100) / 100);

    const cash = await call("POST", "/reservations", {
      token: admin.token,
      body: {
        terrainId: court,
        startTime: slot("15:30", 2),
        bookingMode: "full_court",
        userId: bob.id,
        paymentMethod: "cash_club",
      },
    });
    assert.equal(cash.status, 201);
    assert.deepEqual(cash.body.loyalty, { earned: 0, credited: 0 });
    assert.equal(await loyalty(bob.id), Math.round((before + 0.1) * 100) / 100);
  });

  test("the rule can ask for several tokens per reward: 4 spent earn 1", async () => {
    await settings({ loyaltySpendTokens: 4, loyaltyRewardTokens: 1 });
    const before = await wallet(alice.id);
    const kept = await loyalty(alice.id);
    const r = await book(alice, "17:00", 2);
    assert.deepEqual(r.body.loyalty, { earned: 1, credited: 1 });
    assert.equal(await wallet(alice.id), before - 4 + 1);
    assert.equal(await loyalty(alice.id), kept, "the fraction already there is untouched");
    await settings({ loyaltySpendTokens: 1, loyaltyRewardTokens: 0.1 });
  });

  test("a browser cannot grant itself a reward", async () => {
    const before = await loyalty(alice.id);
    const r = await book(alice, "18:30", 2, {
      bookingMode: "own_spot",
      loyalty: { earned: 50, credited: 50 },
      loyaltyEarned: 50,
      loyaltyBalance: 99,
    });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.loyalty, { earned: 0.1, credited: 0 });
    assert.equal(await loyalty(alice.id), Math.round((before + 0.1) * 100) / 100);
    const edit = await call("PATCH", "/users/me", {
      token: alice.token,
      body: { loyaltyBalance: 99 },
    });
    assert.equal(edit.status, 200);
    assert.equal(await loyalty(alice.id), Math.round((before + 0.1) * 100) / 100);
  });
});

describe("a refund takes the reward back", () => {
  test("book then cancel: tokens and reward both return to where they were", async () => {
    const tokens = await wallet(alice.id);
    const reward = await loyalty(alice.id);
    const r = await book(alice, "08:00", 3);
    assert.equal(await loyalty(alice.id), Math.round((reward + 0.4) * 100) / 100);
    const cancel = await call("POST", `/reservations/${r.body.id}/cancel`, { token: alice.token });
    assert.equal(cancel.status, 200);
    assert.equal(await wallet(alice.id), tokens);
    assert.equal(await loyalty(alice.id), reward);
    // Again and again: nothing is ever gained by booking and cancelling
    for (const hhmm of ["09:30", "11:00", "12:30"]) {
      const again = await book(alice, hhmm, 3);
      await call("POST", `/reservations/${again.body.id}/cancel`, { token: alice.token });
    }
    assert.equal(await wallet(alice.id), tokens);
    assert.equal(await loyalty(alice.id), reward);
    assert.equal((await rewards(alice.id)).length, 2, "no new reward token");
  });

  test("cancelled after the reward became a token: the token leaves the wallet again", async () => {
    await settings({ loyaltySpendTokens: 4, loyaltyRewardTokens: 1 });
    const start = await loyalty(bob.id);
    await credit(bob.id, 20);
    const tokens = await wallet(bob.id);
    const r = await book(bob, "14:00", 3);
    assert.deepEqual(r.body.loyalty, { earned: 1, credited: 1 });
    assert.equal(await wallet(bob.id), tokens - 4 + 1);
    await call("POST", `/reservations/${r.body.id}/cancel`, { token: bob.token });
    // The 4 tokens come back and the reward token is taken back: nothing is kept
    assert.equal(await wallet(bob.id), tokens);
    assert.equal(await loyalty(bob.id), start, "nothing owed, nothing gained");
    const back = await q(
      `select type, amount, reservation_id from token_transactions
        where user_id = $1 and description = 'Loyalty reward taken back'`,
      [bob.id],
    );
    assert.deepEqual(back, [{ type: "debit", amount: 1, reservation_id: r.body.id }]);
    // Again and again: the wallet never grows by booking and cancelling
    for (const hhmm of ["14:00", "15:30"]) {
      const again = await book(bob, hhmm, 3);
      assert.deepEqual(again.body.loyalty, { earned: 1, credited: 1 });
      await call("POST", `/reservations/${again.body.id}/cancel`, { token: bob.token });
    }
    assert.equal(await wallet(bob.id), tokens);
    assert.equal(await loyalty(bob.id), start);
    // A booking that is played keeps its reward
    const next = await book(bob, "15:30", 3);
    assert.deepEqual(next.body.loyalty, { earned: 1, credited: 1 });
    assert.equal(await wallet(bob.id), tokens - 4 + 1);
    await settings({ loyaltySpendTokens: 1, loyaltyRewardTokens: 0.1 });
  });

  test("the reward token already spent elsewhere: it is taken from the refund, never below zero", async () => {
    await settings({ loyaltySpendTokens: 4, loyaltyRewardTokens: 1 });
    const carol = await signup(api.pool, "carol@test.tn", { first_name: "Carol" });
    await credit(carol.id, 4);
    const first = await book(carol, "08:00", 4); // 4 spent, 1 reward token
    assert.equal(await wallet(carol.id), 1);
    // The reward token pays a spot (which earns 0.25 of its own)
    const spot = await book(carol, "09:30", 4, { bookingMode: "own_spot" });
    assert.equal(spot.status, 201);
    assert.equal(await wallet(carol.id), 0);
    await call("POST", `/reservations/${first.body.id}/cancel`, { token: carol.token });
    // 4 refunded, 1 taken back: the reward is not kept because it was already used
    assert.equal(await wallet(carol.id), 3);
    assert.equal(await loyalty(carol.id), 0.25);
    await settings({ loyaltySpendTokens: 1, loyaltyRewardTokens: 0.1 });
  });

  test("leaving a match gives back the spot's reward; the organiser keeps theirs", async () => {
    const organiser = await loyalty(alice.id);
    const match = await book(alice, "17:00", 3, { bookingMode: "own_spot", isPublic: true });
    const before = await loyalty(bob.id);
    await call("POST", `/reservations/${match.body.id}/join`, { token: bob.token });
    assert.equal(await loyalty(bob.id), Math.round((before + 0.1) * 100) / 100);
    const leave = await call("DELETE", `/reservations/${match.body.id}/leave`, {
      token: bob.token,
    });
    assert.equal(leave.status, 200);
    assert.equal(await loyalty(bob.id), before);
    assert.equal(await loyalty(alice.id), Math.round((organiser + 0.1) * 100) / 100);
  });

  test("switched off again: no new reward, what was earned stays", async () => {
    const kept = await loyalty(alice.id);
    await settings({ loyaltyEnabled: false });
    const r = await book(alice, "18:30", 3);
    assert.deepEqual(r.body.loyalty, { earned: 0, credited: 0 });
    assert.equal(await loyalty(alice.id), kept);
  });
});
