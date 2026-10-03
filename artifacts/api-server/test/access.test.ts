/**
 * Who may call what, checked on every route the API really has (read from the
 * router, not from a list kept by hand): a new endpoint that forgets its guard
 * fails here.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { client, createDatabase, dropDatabase, signup, slot, startApi, type Api } from "./harness";

let api: Api;
let call: ReturnType<typeof client>;
type Member = { id: number; token: string };
let admin: Member, alice: Member, bob: Member;
let court: number;

const q = (sql: string, params: unknown[] = []) => api.pool.query(sql, params).then((r) => r.rows);

/** Routes a visitor may call without signing in. Everything else needs a session. */
const PUBLIC = new Set([
  "GET /healthz",
  "GET /terrains",
  "GET /terrains/:id",
  "GET /calendar",
  "GET /open-matches",
  "GET /invites/:token",
  "GET /news",
  "GET /news/:id",
  "GET /tournaments",
  "GET /tournaments/:id",
  "GET /pricing/rules",
  "GET /pricing/quote",
  "GET /equipment",
  "GET /shop/products",
  // Photos uploaded by the desk: shown on public pages, under names nobody can guess
  "GET /media/:key",
  "GET /settings",
  "GET /push/public-key",
  // Guarded by its own secret (x-cron-secret), checked below
  "POST /internal/jobs/run",
  "POST /internal/demo/reset",
  // The payment gateway calls these: they only make the API ask the gateway itself
  "GET /payments/webhook/konnect",
  "GET /payments/webhook/flouci",
  "POST /payments/webhook/flouci",
  // The test suites' stand-in gateway: answers "not found" outside PAYMENT_PROVIDER=test
  "GET /internal/payments/test/pay",
  "POST /internal/payments/test/next",
]);

type Layer = {
  route?: { path: string; methods: Record<string, boolean>; stack: { name: string }[] };
  handle?: { stack?: Layer[] };
};
type Endpoint = { method: string; path: string; guards: string[] };

/** Every endpoint of the API with the names of the guards in front of it. */
async function endpoints(): Promise<Endpoint[]> {
  const { default: router } = await import("../src/routes");
  const out: Endpoint[] = [];
  const walk = (layers: Layer[]) => {
    for (const layer of layers) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods))
          out.push({
            method: method.toUpperCase(),
            path: layer.route.path,
            guards: layer.route.stack.map((h) => h.name),
          });
      } else if (layer.handle?.stack) walk(layer.handle.stack);
    }
  };
  walk((router as unknown as { stack: Layer[] }).stack);
  return out;
}

/** A callable address for a route pattern: ids that exist nowhere, a made-up token. */
const address = (path: string) =>
  path.replace(/:token/g, "made-up-token-0000000000").replace(/:\w+/g, "987654");

before(async () => {
  await createDatabase();
  api = await startApi();
  call = client(api.base);
  admin = await signup(api.pool, "owner@club.tn", { first_name: "Club", last_name: "Owner" });
  await q("update users set role = 'admin' where id = $1", [admin.id]);
  alice = await signup(api.pool, "alice@test.tn", { first_name: "Alice", last_name: "Ben Salah" });
  bob = await signup(api.pool, "bob@test.tn", { first_name: "Bob", last_name: "Trabelsi" });
  const created = await call("POST", "/terrains", {
    token: admin.token,
    body: { name: "Court A", type: "indoor" },
  });
  court = created.body.id;
});

after(async () => {
  assert.deepEqual(await q("select * from token_ledger_audit"), [], "token ledger mismatch");
  await api?.close();
  await dropDatabase();
});

describe("every route has the guard it needs", () => {
  test("the router is read correctly (guards are visible by name)", async () => {
    const all = await endpoints();
    assert.ok(all.length >= 90, `only ${all.length} routes found`);
    const adjust = all.find((e) => e.method === "POST" && e.path === "/tokens/admin/adjust");
    assert.ok(adjust?.guards.includes("requireAdmin"), "token adjustment lost its admin guard");
  });

  test("nothing but the public pages answers a visitor", async () => {
    const leaks: string[] = [];
    for (const e of await endpoints()) {
      const key = `${e.method} ${e.path}`;
      if (PUBLIC.has(key)) continue;
      const res = await call(e.method, address(e.path), {
        body: e.method === "GET" ? undefined : {},
      });
      if (res.status !== 401 || res.body?.code !== "UNAUTHORIZED")
        leaks.push(`${key} → ${res.status} ${JSON.stringify(res.body).slice(0, 80)}`);
    }
    assert.deepEqual(leaks, [], "routes answering without a session");
  });

  test("the public list holds only routes that exist and that have no session guard", async () => {
    const all = await endpoints();
    for (const key of PUBLIC) {
      const e = all.find((x) => `${x.method} ${x.path}` === key);
      assert.ok(e, `${key} is listed as public but does not exist`);
      assert.ok(
        !e.guards.some((g) => ["requireUser", "requireAdmin", "requireAuth"].includes(g)),
        `${key} is listed as public but is guarded`,
      );
    }
  });

  test("every admin route refuses a player, whatever the request says", async () => {
    const adminRoutes = (await endpoints()).filter((e) => e.guards.includes("requireAdmin"));
    assert.ok(adminRoutes.length >= 45, `only ${adminRoutes.length} admin routes found`);
    const open: string[] = [];
    for (const e of adminRoutes) {
      const res = await call(e.method, address(e.path), {
        token: alice.token,
        body: e.method === "GET" ? undefined : { role: "admin", isAdmin: true, userId: admin.id },
      });
      if (res.status !== 403 || res.body?.code !== "FORBIDDEN")
        open.push(`${e.method} ${e.path} → ${res.status}`);
    }
    assert.deepEqual(open, [], "admin routes a player can call");
  });

  test("every route that changes the club's set-up is an admin route", async () => {
    // Writes a player may do: their own profile, bookings, spots, invitations, devices
    const playerWrites = [
      /^\/users\/(me|sync)$/,
      /^\/reservations$/,
      /^\/reservations\/:id\/(cancel|join|leave|invite|equipment|open-match)$/,
      /^\/invites\/:token\/(accept|decline)$/,
      /^\/notifications\//,
      /^\/push\/(subscribe|unsubscribe|test)$/,
      /^\/tournaments\/:id\/register$/,
      // Placing an order; cancelling one is the desk's (an admin route)
      /^\/shop\/orders$/,
      // Paying online for their own tokens or order; the gateway's callback
      /^\/payments\/(tokens|orders\/:orderId|:id\/verify|webhook\/flouci)$/,
      // The cron's own secret (below); the demo reset also answers only in DEMO_MODE
      /^\/internal\/(jobs\/run|demo\/reset|payments\/test\/next)$/,
    ];
    const unguarded = (await endpoints())
      .filter((e) => e.method !== "GET")
      .filter((e) => !e.guards.includes("requireAdmin"))
      .filter((e) => !playerWrites.some((p) => p.test(e.path)))
      .map((e) => `${e.method} ${e.path}`);
    assert.deepEqual(unguarded, [], "writes open to players that are not on the player list");
  });

  test("the scheduled-jobs route needs its secret, and is closed when none is configured", async () => {
    const none = await call("POST", "/internal/jobs/run", {});
    assert.equal(none.status, 401);
    const res = await fetch(`${api.base}/internal/jobs/run`, {
      method: "POST",
      headers: { "x-cron-secret": "" },
    });
    assert.equal(res.status, 401, "an empty secret must never match an unset CRON_SECRET");
    // The demo reset: same secret, and it never answers on a real club (DEMO_MODE off)
    const reset = await fetch(`${api.base}/internal/demo/reset`, {
      method: "POST",
      headers: { "x-cron-secret": "" },
    });
    assert.equal(reset.status, 401);
  });
});

describe("one member's data is never another member's", () => {
  let booking: number;

  before(async () => {
    for (const m of [alice, bob])
      await call("POST", "/tokens/admin/adjust", {
        token: admin.token,
        body: { userId: m.id, type: "credit", amount: 8, description: "Cash at the desk" },
      });
    const r = await call("POST", "/reservations", {
      token: bob.token,
      body: { terrainId: court, startTime: slot("09:30"), bookingMode: "full_court" },
    });
    assert.equal(r.status, 201);
    booking = r.body.id;
  });

  test("a booking, its players and its actions are closed to outsiders", async () => {
    const tries: [string, string, unknown?][] = [
      ["GET", `/reservations/${booking}`],
      ["POST", `/reservations/${booking}/cancel`],
      ["POST", `/reservations/${booking}/invite`, {}],
      ["POST", `/reservations/${booking}/invite`, { userId: alice.id }],
      ["POST", `/reservations/${booking}/equipment`, { items: [{ itemId: 1, quantity: 1 }] }],
      ["POST", `/reservations/${booking}/open-match`, {}],
      ["DELETE", `/reservations/${booking}/open-match`],
      ["PATCH", `/reservations/${booking}`, { notes: "mine now" }],
    ];
    for (const [method, path, body] of tries) {
      const res = await call(method, path, { token: alice.token, body });
      assert.equal(res.status, 403, `${method} ${path} → ${res.status}`);
    }
    const leave = await call("DELETE", `/reservations/${booking}/leave`, { token: alice.token });
    assert.equal(leave.status, 404, "leaving a match one is not in");
    const join = await call("POST", `/reservations/${booking}/join`, { token: alice.token });
    assert.equal(join.body.code, "PRIVATE_MATCH", "joining a private match without an invitation");
    const [row] = await q("select status, notes from reservations where id = $1", [booking]);
    assert.deepEqual(row, { status: "confirmed", notes: null });
  });

  test("lists only ever contain the caller's own rows, whatever the filters", async () => {
    const mine = await call("GET", `/reservations?userId=${bob.id}&limit=100`, {
      token: alice.token,
    });
    assert.equal(mine.body.total, 0, "another member's bookings through ?userId");
    const upcoming = await call("GET", "/reservations/upcoming", { token: alice.token });
    assert.equal(upcoming.body.length, 0);
    const ledger = await call("GET", `/tokens/transactions?userId=${bob.id}`, {
      token: alice.token,
    });
    assert.ok(
      ledger.body.data.every((t: { userId: number }) => t.userId === alice.id),
      "another member's ledger through ?userId",
    );
    const bal = await call("GET", `/tokens/balance?userId=${bob.id}`, { token: alice.token });
    assert.equal(bal.body.userId, alice.id);
    for (const path of [`/users/${bob.id}`, `/users?search=bob`]) {
      const res = await call("GET", path, { token: alice.token });
      assert.equal(res.status, 403, path);
    }
    const notes = await call("GET", "/notifications", { token: alice.token });
    assert.ok(notes.body.every((n: { userId: number }) => n.userId === alice.id));
  });

  test("the calendar shows a visitor that a slot is taken, never by whom in full", async () => {
    await q("update users set phone = '+216 55 000 111' where id = $1", [bob.id]);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(
      new Date(slot("09:30")),
    );
    for (const token of [undefined, alice.token]) {
      const cal = await call("GET", `/calendar?date=${day}`, { token });
      const text = JSON.stringify(cal.body);
      assert.ok(text.includes(`"reservationId":${booking}`), "the booked slot is listed");
      for (const secret of [
        "bob@test.tn",
        "Trabelsi",
        "55 000 111",
        "supabaseAuthId",
        "tokenBalance",
      ])
        assert.ok(!text.includes(secret), `the calendar shows "${secret}" to an outsider`);
    }
  });

  test("a cash payment marked twice at the same instant is recorded once", async () => {
    const open = await call("POST", "/reservations", {
      token: bob.token,
      body: { terrainId: court, startTime: slot("11:00"), bookingMode: "own_spot" },
    });
    assert.equal(open.status, 201);
    const join = await call("POST", `/reservations/${open.body.id}/join`, {
      token: alice.token,
      body: { paymentMethod: "cash_club" },
    });
    assert.equal(join.status, 201);
    const [spot] = await q(
      "select id from reservation_players where reservation_id = $1 and user_id = $2",
      [open.body.id, alice.id],
    );
    const mark = () =>
      call("PATCH", `/reservations/${open.body.id}/players/${spot.id}`, {
        token: admin.token,
        body: { paymentStatus: "paid" },
      });
    const results = await Promise.all([mark(), mark(), mark()]);
    assert.deepEqual(
      results.map((r) => [r.status, r.body.paymentStatus]),
      [
        [200, "paid"],
        [200, "paid"],
        [200, "paid"],
      ],
    );
    const log = await q("select message from activity where type = 'payment_updated'");
    assert.equal(log.length, 1, "one desk action, one line in the audit trail");
  });
});
