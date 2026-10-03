import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { client, createDatabase, dropDatabase, sign, signup, type Api, startApi } from "./harness";

// This file runs the API as the public demo (each test file is its own process)
process.env.DEMO_MODE = "true";
process.env.DEMO_PASSWORD = "Demo-padel-2026";
process.env.CRON_SECRET = "demo-cron-secret";

let api: Api;
let call: ReturnType<typeof client>;
let demo: typeof import("../src/lib/demo-seed");
type Account = { id: number; token: string };
let player: Account, desk: Account;

const q = (sql: string, params: unknown[] = []) => api.pool.query(sql, params).then((r) => r.rows);
/** The shared accounts as they are after a reset (Supabase Auth can't be reached here). */
async function accounts() {
  const rows = await q(
    "select id, supabase_auth_id, email from users where email in ('joueur@example.com', 'club@example.com')",
  );
  const as = (email: string) => {
    const r = rows.find((x) => x.email === email);
    return { id: r.id as number, token: sign(r.supabase_auth_id, email) };
  };
  player = as("joueur@example.com");
  desk = as("club@example.com");
}

before(async () => {
  await createDatabase();
  api = await startApi();
  call = client(api.base);
  demo = await import("../src/lib/demo-seed");
});

after(async () => {
  assert.deepEqual(await q("select * from token_ledger_audit"), [], "token ledger mismatch");
  await api?.close();
  await dropDatabase();
});

describe("the demo club", () => {
  test("an empty database becomes the demo club", async () => {
    const counts = await demo.resetDemo();
    assert.equal(counts.courts, 4);
    assert.ok(counts.reservations >= 8);
    await accounts();

    const rules = (await call("GET", "/settings")).body;
    assert.equal(rules.loyaltyEnabled, true);
    assert.deepEqual(
      rules.tokenPackages.map((p: { tokens: number; price: number }) => [p.tokens, p.price]),
      [
        [10, 200],
        [20, 380],
        [50, 900],
      ],
    );
    assert.deepEqual(rules.demo, {
      resetHour: 4,
      accounts: {
        player: { email: "joueur@example.com", password: "Demo-padel-2026" },
        admin: { email: "club@example.com", password: "Demo-padel-2026" },
      },
    });

    // Every person is invented: nobody outside example.com
    assert.deepEqual(await q("select email from users where email not ilike '%@example.com'"), []);
    const me = await call("GET", "/users/me", { token: player.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.role, "player");
    assert.ok(me.body.tokenBalance > 0, "tokens to book with");
    assert.equal((await call("GET", "/users/me", { token: desk.token })).body.role, "admin");

    // Something to see everywhere: open matches, tournaments, news, shop, an order to call
    assert.ok((await call("GET", "/open-matches")).body.length >= 2, "open matches");
    assert.ok((await call("GET", "/tournaments")).body.length >= 4);
    assert.ok((await call("GET", "/news")).body.data.length >= 4);
    assert.equal((await call("GET", "/shop/products")).body.length, 6);
    const orders = await call("GET", "/admin/shop/orders", { token: desk.token });
    assert.equal(orders.body.pending, 1);
    const mine = await call("GET", "/reservations", { token: player.token });
    assert.ok(mine.body.data.length >= 2, "the demo player has bookings");
  });

  test("the reset is due once a night, at the reset hour", async () => {
    assert.equal(await demo.resetDemoIfDue(), false, "just reset");
    await q("update activity set created_at = created_at - interval '2 days' where message = $1", [
      demo.RESET_MARKER,
    ]);
    assert.equal(await demo.resetDemoIfDue(), true, "a night has passed");
    await accounts();
  });
});

describe("only the demo accounts get in", () => {
  let stranger: { id: number; token: string };

  before(async () => {
    stranger = await signup(api.pool, "real.person@gmail.com", { first_name: "Real" });
  });

  test("somebody who signed up for real is turned away", async () => {
    const me = await call("GET", "/users/me", { token: stranger.token });
    assert.equal(me.status, 403);
    assert.equal(me.body.code, "DEMO_ACCOUNT_ONLY");
    const sync = await call("POST", "/users/sync", { token: stranger.token, body: {} });
    assert.equal(sync.status, 403);
    // Public pages still answer them as a visitor
    assert.equal((await call("GET", "/terrains", { token: stranger.token })).status, 200);
  });

  test("…and never shown to the visitors of the demo", async () => {
    const list = await call("GET", "/users?limit=200", { token: desk.token });
    assert.ok(list.body.data.every((u: { email: string }) => u.email.endsWith("@example.com")));
    assert.equal((await call("GET", `/users/${stranger.id}`, { token: desk.token })).status, 404);
    const search = await call("GET", "/members/search?q=Real", { token: player.token });
    assert.deepEqual(search.body, []);
  });

  test("no file of a visitor is kept: photos are links in the demo", async () => {
    const res = await fetch(`${api.base}/admin/media`, {
      method: "POST",
      headers: { authorization: `Bearer ${desk.token}`, "content-type": "image/jpeg" },
      body: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
    });
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { code: string }).code, "DEMO_LOCKED");
    // The invented boutique shows the gallery: an article with more than one photo
    const catalogue = (await call("GET", "/shop/products")).body as { imageUrls: string[] }[];
    assert.ok(catalogue.some((p) => p.imageUrls.length > 1));
  });

  test("roles can't be changed: a visitor can't lock the next ones out", async () => {
    const r = await call("PATCH", `/users/${player.id}`, {
      token: desk.token,
      body: { role: "admin" },
    });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "DEMO_LOCKED");
    // Other edits of a member still work
    const edit = await call("PATCH", `/users/${player.id}`, {
      token: desk.token,
      body: { phone: "+216 00 999 999" },
    });
    assert.equal(edit.status, 200);
  });
});

describe("whatever visitors do, the next night puts it back", () => {
  test("deleted, changed and real data are gone after the reset", async () => {
    const courts = (await call("GET", "/terrains")).body;
    await call("PATCH", `/terrains/${courts[0].id}`, {
      token: desk.token,
      body: { name: "Hacked" },
    });
    await call("PATCH", "/admin/settings", { token: desk.token, body: { shopEnabled: false } });
    await demo.resetDemo();
    await accounts();
    assert.equal((await call("GET", "/terrains")).body[0].name, "Court Central");
    assert.equal((await call("GET", "/settings")).body.shopEnabled, true);
    assert.equal(
      (await call("GET", "/users/me", { token: player.token })).body.phone,
      "+216 00 100 100",
    );
    assert.deepEqual(
      await q("select email from users where email = 'real.person@gmail.com'"),
      [],
      "a real sign-up is not kept",
    );
  });

  test("the reset can be asked for by the cron, with its secret only", async () => {
    const anon = await call("POST", "/internal/demo/reset");
    assert.equal(anon.status, 401);
    const res = await fetch(`${api.base}/internal/demo/reset`, {
      method: "POST",
      headers: { "x-cron-secret": "demo-cron-secret" },
    });
    assert.equal(res.status, 200);
    await accounts();
  });
});

describe("never on a real club's data", () => {
  test("members with real bookings or tokens: refused, unless forced", async () => {
    const real = await signup(api.pool, "member@club.tn", { first_name: "Member" });
    // A real member's purchase, written like the ledger does (one transaction)
    const c = await api.pool.connect();
    try {
      await c.query("begin");
      await c.query("update users set token_balance = 5 where id = $1", [real.id]);
      await c.query(
        "insert into token_transactions (user_id, type, amount, balance_after, description) values ($1, 'credit', 5, 5, 'Cash')",
        [real.id],
      );
      await c.query("commit");
    } finally {
      c.release();
    }
    assert.match(String(await demo.refusalReason()), /real members/);
    await assert.rejects(demo.resetDemo(), /refused/);
    assert.equal((await q("select id from users where id = $1", [real.id])).length, 1, "kept");
    const refused = await fetch(`${api.base}/internal/demo/reset`, {
      method: "POST",
      headers: { "x-cron-secret": "demo-cron-secret" },
    });
    assert.equal(refused.status, 409);

    await demo.resetDemo({ force: true });
    assert.equal(await demo.refusalReason(), null);
    await accounts();
  });

  test("a base with courts that was never a demo is refused too", async () => {
    await q("delete from activity where message = $1", [demo.RESET_MARKER]);
    assert.match(String(await demo.refusalReason()), /never a demo/);
    await assert.rejects(demo.resetDemo(), /refused/);
  });
});
