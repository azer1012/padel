import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { client, createDatabase, dropDatabase, signup, startApi, type Api } from "./harness";

let api: Api;
let call: ReturnType<typeof client>;
type Member = { id: number; token: string };
let admin: Member, alice: Member, bob: Member;
let racket: number, balls: number;

const q = (sql: string, params: unknown[] = []) => api.pool.query(sql, params).then((r) => r.rows);
const stock = async (id: number) =>
  (await q("select stock from shop_products where id = $1", [id]))[0].stock as number;
const order = (token: string, body: Record<string, unknown>) =>
  call("POST", "/shop/orders", { token, body });
const pickup = { deliveryMethod: "pickup" };
/** The desk cancels an order (as the admin, unless another token is given). */
const deskCancel = (id: number, token = admin.token) =>
  call("PATCH", `/admin/shop/orders/${id}`, { token, body: { status: "cancelled" } });
/** Notifications are sent after the answer: wait until `n` rows match. */
async function notices(userId: number, type: string, n: number) {
  let rows: { title: string; message: string }[] = [];
  for (let i = 0; i < 40; i++) {
    rows = await q("select title, message from notifications where user_id = $1 and type = $2", [
      userId,
      type,
    ]);
    if (rows.length >= n) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  return rows;
}

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
  bob = await signup(api.pool, "bob@test.tn", { first_name: "Bob" });
});

after(async () => {
  assert.deepEqual(await q("select * from token_ledger_audit"), [], "token ledger mismatch");
  // No article was sold below zero, and every order's total equals its lines
  assert.deepEqual(await q("select id from shop_products where stock < 0"), []);
  assert.deepEqual(
    await q(`select o.id from shop_orders o
             join shop_order_items i on i.order_id = o.id
             group by o.id, o.total having o.total <> sum(i.unit_price * i.quantity)`),
    [],
    "an order total that is not the sum of its lines",
  );
  await api?.close();
  await dropDatabase();
});

describe("catalogue", () => {
  test("the admin adds articles; input is validated", async () => {
    const a = await call("POST", "/admin/shop/products", {
      token: admin.token,
      body: {
        name: "Raquette Carbone Pro",
        category: "racket",
        price: 349.9,
        stock: 3,
        imageUrls: ["/club-detail-1920.webp"],
        description: "Carbone 12K",
      },
    });
    assert.equal(a.status, 201);
    racket = a.body.id;
    const b = await call("POST", "/admin/shop/products", {
      token: admin.token,
      body: { name: "Tube de 3 balles", category: "balls", price: 18, stock: 10 },
    });
    assert.equal(b.status, 201);
    balls = b.body.id;

    for (const body of [
      { name: "", price: 10 },
      { name: "Sac", price: -1 },
      { name: "Sac", price: 0 },
      { name: "Sac", price: 10, stock: 1.5 },
      { name: "Sac", price: 10, imageUrls: ["javascript:alert(1)"] },
      { name: "Sac", price: 10, imageUrls: "/club-detail-1920.webp" },
    ]) {
      const bad = await call("POST", "/admin/shop/products", { token: admin.token, body });
      assert.equal(bad.status, 400, JSON.stringify(body));
      assert.equal(bad.body.code, "VALIDATION_ERROR");
    }
  });

  test("visitors see what is on sale; an article taken off sale disappears", async () => {
    const hidden = await call("POST", "/admin/shop/products", {
      token: admin.token,
      body: { name: "Ancien modèle", price: 99, stock: 2, isActive: false },
    });
    assert.equal(hidden.status, 201);
    const list = await call("GET", "/shop/products");
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.map((p: { name: string }) => p.name).sort(), [
      "Raquette Carbone Pro",
      "Tube de 3 balles",
    ]);
    assert.equal(list.body[0].isActive, undefined, "internal fields are not published");
  });

  test("players cannot touch the catalogue", async () => {
    const create = await call("POST", "/admin/shop/products", {
      token: alice.token,
      body: { name: "Gratuit", price: 0, stock: 100 },
    });
    assert.equal(create.status, 403);
    const edit = await call("PATCH", `/admin/shop/products/${racket}`, {
      token: alice.token,
      body: { price: 1 },
    });
    assert.equal(edit.status, 403);
    assert.equal(
      (await q("select price from shop_products where id = $1", [racket]))[0].price,
      "349.90",
    );
  });
});

describe("ordering", () => {
  let aliceOrder: number;

  test("a visitor must sign in; an empty or malformed cart is refused", async () => {
    const visitor = await call("POST", "/shop/orders", { body: { items: [] } });
    assert.equal(visitor.status, 401);
    for (const items of [
      [],
      [{ productId: racket, quantity: 0 }],
      [{ productId: racket, quantity: 2.5 }],
      [{ productId: "x", quantity: 1 }],
      [{ productId: racket, quantity: 999 }],
    ]) {
      const bad = await order(alice.token, { ...pickup, items });
      assert.equal(bad.status, 400, JSON.stringify(items));
    }
    assert.equal((await q("select count(*)::int as n from shop_orders"))[0].n, 0);
  });

  test("the total and the prices come from the catalogue, whatever the browser sends", async () => {
    const r = await order(alice.token, {
      ...pickup,
      items: [
        { productId: racket, quantity: 1, price: 1, unitPrice: 1 },
        { productId: balls, quantity: 2 },
      ],
      // none of these may change who orders, the amount or the state
      total: 1,
      userId: bob.id,
      status: "delivered",
      currency: "EUR",
    });
    assert.equal(r.status, 201);
    aliceOrder = r.body.id;
    assert.equal(r.body.userId, alice.id);
    assert.equal(r.body.status, "pending");
    assert.equal(r.body.total, 385.9);
    assert.equal(r.body.currency, "TND");
    assert.equal(r.body.contactPhone, "+216 20 111 222", "phone of the profile");
    assert.equal(r.body.contactName, "Alice Ben Salah");
    assert.equal(r.body.items.length, 2);
    assert.equal(await stock(racket), 2);
    assert.equal(await stock(balls), 8);
  });

  test("the admins are told who to call, the member that the club will call", async () => {
    const toAdmin = await notices(admin.id, "order_placed", 1);
    assert.equal(toAdmin.length, 1);
    assert.match(toAdmin[0].message, /Alice Ben Salah/);
    assert.match(toAdmin[0].message, /\+216 20 111 222/);
    const toMember = await notices(alice.id, "order_update", 1);
    assert.equal(toMember.length, 1);
    assert.match(toMember[0].message, /vous appelle/);
  });

  test("a phone number is required, and an address for a delivery", async () => {
    const noPhone = await order(bob.token, {
      ...pickup,
      items: [{ productId: balls, quantity: 1 }],
    });
    assert.equal(noPhone.status, 400);
    assert.equal(noPhone.body.code, "PHONE_REQUIRED");
    const noAddress = await order(bob.token, {
      deliveryMethod: "delivery",
      contactPhone: "+216 55 000 111",
      items: [{ productId: balls, quantity: 1 }],
    });
    assert.equal(noAddress.status, 400);
    assert.equal(noAddress.body.code, "ADDRESS_REQUIRED");
    assert.equal(await stock(balls), 8, "a refused order takes no stock");
  });

  test("the same checkout sent 6 times at once creates one order", async () => {
    const body = {
      deliveryMethod: "delivery",
      contactPhone: "+216 55 000 111",
      address: "12 rue des Jasmins",
      city: "Tunis",
      items: [{ productId: balls, quantity: 2 }],
      idempotencyKey: "checkout-bob-1",
    };
    const answers = await Promise.all(Array.from({ length: 6 }, () => order(bob.token, body)));
    assert.ok(answers.every((a) => a.status === 201 || a.status === 200));
    assert.equal(new Set(answers.map((a) => a.body.id)).size, 1);
    assert.equal(await stock(balls), 6);
    assert.equal(
      (await q("select count(*)::int as n from shop_orders where user_id = $1", [bob.id]))[0].n,
      1,
    );
    // Somebody else's key gives nothing away, and is a clear refusal (not a server error)
    const other = await order(alice.token, { ...body, idempotencyKey: "checkout-bob-1" });
    assert.equal(other.status, 409);
    assert.equal(other.body.code, "DUPLICATE_REQUEST");
    assert.notEqual(other.body.userId, bob.id);
    assert.equal(await stock(balls), 6, "no stock taken");
  });

  test("the last unit goes to one member: nobody is sold what is not there", async () => {
    // 2 rackets left, three members' worth of requests for 1 each plus one for 2
    const answers = await Promise.all([
      order(alice.token, { ...pickup, items: [{ productId: racket, quantity: 2 }] }),
      order(bob.token, {
        ...pickup,
        contactPhone: "+216 55 000 111",
        items: [{ productId: racket, quantity: 2 }],
      }),
    ]);
    const statuses = answers.map((a) => a.status).sort();
    assert.deepEqual(statuses, [201, 409]);
    const refused = answers.find((a) => a.status === 409)!;
    assert.equal(refused.body.code, "OUT_OF_STOCK");
    assert.equal(await stock(racket), 0);
  });

  test("a member sees only their own orders, and never the staff notes", async () => {
    await call("PATCH", `/admin/shop/orders/${aliceOrder}`, {
      token: admin.token,
      body: { adminNotes: "Rappeler après 18 h" },
    });
    const mine = await call("GET", "/shop/orders", { token: alice.token });
    assert.equal(mine.status, 200);
    assert.ok(mine.body.every((o: { userId: number }) => o.userId === alice.id));
    assert.ok(mine.body.every((o: Record<string, unknown>) => !("adminNotes" in o)));
    const players = await call("GET", "/admin/shop/orders", { token: alice.token });
    assert.equal(players.status, 403);
  });

  test("a member cannot cancel an order from the site: the desk does, and the stock comes back once", async () => {
    // Neither their own nor anybody's: there is no such route for members
    for (const who of [alice, bob]) {
      const r = await call("POST", `/shop/orders/${aliceOrder}/cancel`, { token: who.token });
      assert.equal(r.status, 404);
    }
    // Nor through the desk's route
    const sneaky = await deskCancel(aliceOrder, alice.token);
    assert.equal(sneaky.status, 403);
    const [row] = await q("select status from shop_orders where id = $1", [aliceOrder]);
    assert.equal(row.status, "pending", "the order is untouched");

    // The desk cancels after the call; pressed five times, the stock comes back once
    const before = await stock(balls);
    const answers = await Promise.all(Array.from({ length: 5 }, () => deskCancel(aliceOrder)));
    assert.ok(answers.every((a) => a.status === 200 && a.body.status === "cancelled"));
    assert.equal(await stock(balls), before + 2);
    assert.equal(await stock(racket), 1);
    const told = await notices(alice.id, "order_update", 2);
    assert.ok(
      told.some((n) => /annul/i.test(`${n.title} ${n.message}`)),
      "the member is told",
    );
  });
});

describe("the desk handles an order", () => {
  let id: number;

  before(async () => {
    const r = await order(alice.token, { ...pickup, items: [{ productId: balls, quantity: 1 }] });
    assert.equal(r.status, 201);
    id = r.body.id;
  });

  test("the list shows the member to call and how many orders are waiting", async () => {
    const list = await call("GET", "/admin/shop/orders?status=pending", { token: admin.token });
    assert.equal(list.status, 200);
    const row = list.body.data.find((o: { id: number }) => o.id === id);
    assert.equal(row.contactPhone, "+216 20 111 222");
    assert.equal(row.member.name, "Alice Ben Salah");
    assert.equal(list.body.pending, list.body.data.length);
  });

  test("an order follows its steps; a step that makes no sense is refused", async () => {
    const skip = await call("PATCH", `/admin/shop/orders/${id}`, {
      token: admin.token,
      body: { status: "delivered" },
    });
    assert.equal(skip.status, 400);
    assert.equal(skip.body.code, "INVALID_TRANSITION");

    for (const status of ["confirmed", "shipped", "delivered"]) {
      const r = await call("PATCH", `/admin/shop/orders/${id}`, {
        token: admin.token,
        body: { status },
      });
      assert.equal(r.status, 200, status);
      assert.equal(r.body.status, status);
      assert.equal(r.body.handledBy, admin.id);
    }
    const reopen = await call("PATCH", `/admin/shop/orders/${id}`, {
      token: admin.token,
      body: { status: "pending" },
    });
    assert.equal(reopen.status, 400);

    // pending (at order time) + confirmed + shipped + delivered, once each
    const told = await notices(alice.id, "order_update", 5);
    assert.ok(told.some((n) => /confirmée/.test(n.message)));
    assert.ok(told.some((n) => /en route/.test(n.message)));
    assert.ok(told.some((n) => /remise/.test(n.message)));
    const trail = await q(
      "select message from activity where type = 'order_updated' and message like $1",
      [`Shop order #${id} is now %`],
    );
    assert.equal(trail.length, 3);
  });

  test("the desk cancelling a confirmed order gives the stock back", async () => {
    const r = await order(alice.token, { ...pickup, items: [{ productId: balls, quantity: 3 }] });
    const before = await stock(balls);
    await call("PATCH", `/admin/shop/orders/${r.body.id}`, {
      token: admin.token,
      body: { status: "confirmed" },
    });
    const cancel = await call("PATCH", `/admin/shop/orders/${r.body.id}`, {
      token: admin.token,
      body: { status: "cancelled" },
    });
    assert.equal(cancel.status, 200);
    assert.equal(await stock(balls), before + 3);
    const twice = await call("PATCH", `/admin/shop/orders/${r.body.id}`, {
      token: admin.token,
      body: { status: "cancelled" },
    });
    assert.equal(twice.status, 200, "the same state again changes nothing");
    assert.equal(await stock(balls), before + 3);
  });

  test("the list of orders in progress leaves out the delivered and the cancelled", async () => {
    const waiting = await order(alice.token, {
      ...pickup,
      items: [{ productId: balls, quantity: 1 }],
    });
    const open = await call("GET", "/admin/shop/orders?status=open", { token: admin.token });
    assert.equal(open.status, 200);
    const states = open.body.data.map((o: { status: string }) => o.status);
    assert.ok(states.length > 0 && open.body.total === states.length);
    assert.ok(states.every((s: string) => ["pending", "confirmed", "shipped"].includes(s)));
    assert.ok(open.body.data.some((o: { id: number }) => o.id === waiting.body.id));
    const all = await call("GET", "/admin/shop/orders", { token: admin.token });
    assert.ok(
      all.body.total > open.body.total,
      "delivered and cancelled orders are in the full list",
    );
    await deskCancel(waiting.body.id);
  });

  test("an article with orders is archived, not deleted; a price change never rewrites an order", async () => {
    await call("PATCH", `/admin/shop/products/${balls}`, {
      token: admin.token,
      body: { price: 25 },
    });
    const [line] = await q(
      "select unit_price from shop_order_items where order_id = $1 and product_id = $2",
      [id, balls],
    );
    assert.equal(line.unit_price, "18.00");
    const del = await call("DELETE", `/admin/shop/products/${balls}`, { token: admin.token });
    assert.equal(del.body.archived, true);
    const list = await call("GET", "/shop/products");
    assert.ok(!list.body.some((p: { id: number }) => p.id === balls));
    const gone = await order(alice.token, {
      ...pickup,
      items: [{ productId: balls, quantity: 1 }],
    });
    assert.equal(gone.status, 409);
    assert.equal(gone.body.code, "PRODUCT_GONE");
  });
});

describe("guards", () => {
  let grip: number;
  let carol: Member;

  before(async () => {
    carol = await signup(api.pool, "carol@test.tn", {
      first_name: "Carol",
      phone: "+216 22 333 444",
    });
    const r = await call("POST", "/admin/shop/products", {
      token: admin.token,
      body: { name: "Surgrip", category: "accessory", price: 5, stock: 50 },
    });
    grip = r.body.id;
  });

  test("a member can't hold more than 3 orders waiting for the call", async () => {
    const one = { ...pickup, items: [{ productId: grip, quantity: 1 }] };
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await order(carol.token, one);
      assert.equal(r.status, 201);
      ids.push(r.body.id);
    }
    const fourth = await order(carol.token, one);
    assert.equal(fourth.status, 409);
    assert.equal(fourth.body.code, "TOO_MANY_PENDING_ORDERS");
    assert.equal(await stock(grip), 47, "the refused order took nothing");
    // Once the club has called (confirmed or cancelled by the desk), the member can order again
    await call("PATCH", `/admin/shop/orders/${ids[0]}`, {
      token: admin.token,
      body: { status: "confirmed" },
    });
    assert.equal((await order(carol.token, one)).status, 201);
    for (const id of ids.slice(1)) await deskCancel(id);
  });

  test("the name and phone given are kept on one line (they go into e-mail subjects)", async () => {
    const r = await order(carol.token, {
      ...pickup,
      contactName: "Carol\r\nBcc: someone@else.tn",
      items: [{ productId: grip, quantity: 1 }],
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.contactName, "Carol Bcc: someone@else.tn");
    await deskCancel(r.body.id);
  });

  test("editing an article never undoes the stock taken by orders placed meanwhile", async () => {
    const seen = await stock(grip);
    // A member orders while the admin's form is open
    const r = await order(carol.token, { ...pickup, items: [{ productId: grip, quantity: 2 }] });
    assert.equal(r.status, 201);
    const stale = await call("PATCH", `/admin/shop/products/${grip}`, {
      token: admin.token,
      body: { stock: seen + 10, stockWas: seen, price: 6 },
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, "STOCK_CHANGED");
    assert.equal(await stock(grip), seen - 2, "unchanged");
    // With the current figure, the change goes through
    const ok = await call("PATCH", `/admin/shop/products/${grip}`, {
      token: admin.token,
      body: { stock: seen + 10, stockWas: seen - 2 },
    });
    assert.equal(ok.status, 200);
    assert.equal(await stock(grip), seen + 10);
    // A change that leaves the stock alone is never refused
    const price = await call("PATCH", `/admin/shop/products/${grip}`, {
      token: admin.token,
      body: { price: 6 },
    });
    assert.equal(price.status, 200);
    await deskCancel(r.body.id);
  });
});

describe("the club can switch the shop off", () => {
  test("off: an empty catalogue for visitors, orders refused", async () => {
    const off = await call("PATCH", "/admin/settings", {
      token: admin.token,
      body: { shopEnabled: false },
    });
    assert.equal(off.status, 200);
    assert.equal((await call("GET", "/settings")).body.shopEnabled, false);
    assert.deepEqual((await call("GET", "/shop/products")).body, []);
    const r = await order(alice.token, { ...pickup, items: [{ productId: racket, quantity: 1 }] });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "FEATURE_DISABLED");
    await call("PATCH", "/admin/settings", { token: admin.token, body: { shopEnabled: true } });
    assert.equal((await call("GET", "/settings")).body.shopEnabled, true);
  });
});
