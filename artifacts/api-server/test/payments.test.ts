/**
 * Online payment: tokens bought and boutique orders paid through the club's gateway.
 * The gateway here is the stand-in of the test suites (PAYMENT_PROVIDER=test): the
 * tests decide what it answers. The two real adapters (Konnect, Flouci) are checked
 * at the end against a local server that answers like their documentation.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { client, createDatabase, dropDatabase, signup, startApi, type Api } from "./harness";
import { testGateway } from "../src/lib/payments/test-provider";
import { konnect } from "../src/lib/payments/konnect";
import { flouci } from "../src/lib/payments/flouci";

let api: Api;
let call: ReturnType<typeof client>;
type Member = { id: number; token: string };
let admin: Member, alice: Member, bob: Member;
let pack10: number;
let balls: number;

const q = (sql: string, params: unknown[] = []) => api.pool.query(sql, params).then((r) => r.rows);
const balance = async (id: number) =>
  (await q("select token_balance from users where id = $1", [id]))[0].token_balance as number;
const refOf = async (paymentId: number) =>
  (await q("select provider_ref from payments where id = $1", [paymentId]))[0]
    .provider_ref as string;
const verify = (who: Member, id: number) =>
  call("POST", `/payments/${id}/verify`, { token: who.token });
const settings = (body: Record<string, unknown>) =>
  call("PATCH", "/admin/settings", { token: admin.token, body });
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Tunis" });

before(async () => {
  process.env.PAYMENT_PROVIDER = "test";
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
  pack10 = (await q("select id from token_packages where tokens = 10"))[0].id;
  const p = await call("POST", "/admin/shop/products", {
    token: admin.token,
    body: { name: "Tube de 3 balles", category: "balls", price: 18, stock: 20 },
  });
  balls = p.body.id;
});

after(async () => {
  assert.deepEqual(await q("select * from token_ledger_audit"), [], "token ledger mismatch");
  // Every payment that credited tokens credited them once, for what it was
  assert.deepEqual(
    await q(`select p.id from payments p
              left join token_transactions t on t.id = p.token_transaction_id
             where p.purpose = 'tokens' and p.status = 'paid'
               and (t.id is null or t.amount <> p.tokens or t.user_id <> p.user_id)`),
    [],
  );
  assert.deepEqual(
    await q(`select idempotency_key from token_transactions
              where idempotency_key like 'payment:%'
              group by 1 having count(*) > 1`),
    [],
  );
  delete process.env.PAYMENT_PROVIDER;
  await api?.close();
  await dropDatabase();
});

describe("the club's switch", () => {
  test("visitors are told whether they can pay online; the club can switch it off", async () => {
    const on = await call("GET", "/settings");
    assert.deepEqual(on.body.onlinePayment, { enabled: true, provider: "test" });
    assert.equal((await settings({ onlinePaymentEnabled: false })).status, 200);
    const off = await call("GET", "/settings");
    assert.deepEqual(off.body.onlinePayment, { enabled: false, provider: null });
    const refused = await call("POST", "/payments/tokens", {
      token: alice.token,
      body: { packageId: pack10 },
    });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.code, "FEATURE_DISABLED");
    assert.equal((await q("select count(*)::int as n from payments"))[0].n, 0);
    await settings({ onlinePaymentEnabled: true });
  });

  test("only in dinars: another currency switches it off", async () => {
    await settings({ currency: "EUR" });
    assert.equal((await call("GET", "/settings")).body.onlinePayment.enabled, false);
    await settings({ currency: "TND" });
    assert.equal((await call("GET", "/settings")).body.onlinePayment.enabled, true);
  });
});

describe("buying tokens", () => {
  let paymentId: number;

  test("a visitor must sign in; a pack off sale or a silly number is refused", async () => {
    assert.equal((await call("POST", "/payments/tokens", { body: { tokens: 5 } })).status, 401);
    for (const body of [
      {},
      { tokens: 0 },
      { tokens: 2.5 },
      { tokens: 5000 },
      { packageId: 987654 },
    ]) {
      const r = await call("POST", "/payments/tokens", { token: alice.token, body });
      assert.equal(r.status, 400, JSON.stringify(body));
    }
    assert.equal((await q("select count(*)::int as n from payments"))[0].n, 0);
  });

  test("the price is the pack's, whatever the browser sends; nothing is credited before the gateway says paid", async () => {
    const r = await call("POST", "/payments/tokens", {
      token: alice.token,
      body: { packageId: pack10, amount: 1, tokens: 500, userId: bob.id, status: "paid" },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    paymentId = r.body.id;
    assert.equal(r.body.status, "pending");
    assert.equal(r.body.amount, 250);
    assert.equal(r.body.tokens, 10);
    assert.equal(r.body.currency, "TND");
    assert.match(r.body.checkoutUrl, /^http/);
    assert.ok(!("providerRef" in r.body), "the gateway's reference stays with the API");
    const [row] = await q("select user_id from payments where id = $1", [paymentId]);
    assert.equal(row.user_id, alice.id, "the payer is the signed-in member");

    // Coming back before paying: still pending, nothing credited
    const early = await verify(alice, paymentId);
    assert.equal(early.body.status, "pending");
    assert.equal(await balance(alice.id), 0);
  });

  test("the same purchase asked again a moment later opens the same payment", async () => {
    const again = await call("POST", "/payments/tokens", {
      token: alice.token,
      body: { packageId: pack10 },
    });
    assert.equal(again.body.id, paymentId);
    assert.equal((await q("select count(*)::int as n from payments"))[0].n, 1);
  });

  test("another member never reaches the payment", async () => {
    assert.equal((await call("GET", `/payments/${paymentId}`, { token: bob.token })).status, 404);
    assert.equal((await verify(bob, paymentId)).status, 404);
    assert.equal((await call("GET", `/payments/${paymentId}`)).status, 401);
  });

  test("paid: the tokens arrive once, however often the payment is checked", async () => {
    testGateway.set(await refOf(paymentId), "paid");
    const answers = await Promise.all(Array.from({ length: 6 }, () => verify(alice, paymentId)));
    assert.ok(answers.every((a) => a.status === 200 && a.body.status === "paid"));
    assert.equal(await balance(alice.id), 10);
    const ledger = await q(
      "select type, amount, description, cash_amount, idempotency_key, package_id from token_transactions where user_id = $1",
      [alice.id],
    );
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].type, "credit");
    assert.equal(ledger[0].amount, 10);
    assert.match(ledger[0].description, /^Online purchase · .*\(10 tokens\)$/);
    assert.equal(ledger[0].cash_amount, null, "no cash passed through the desk");
    assert.equal(ledger[0].idempotency_key, `payment:${paymentId}`);
    assert.equal(ledger[0].package_id, pack10);
    assert.equal((await verify(alice, paymentId)).body.checkoutUrl, null);
    const [trail] = await q("select message from activity where type = 'payment_received'");
    assert.match(trail.message, /^Online payment · 10 token\(s\) · 250 TND \(test\)$/);
  });

  test("single tokens cost the club's token price, above the club's minimum", async () => {
    const r = await call("POST", "/payments/tokens", { token: bob.token, body: { tokens: 3 } });
    assert.equal(r.status, 201);
    assert.equal(r.body.amount, 75);
    assert.equal(r.body.tokens, 3);
    await settings({ tokenMinPurchase: 5 });
    const few = await call("POST", "/payments/tokens", { token: bob.token, body: { tokens: 4 } });
    assert.equal(few.status, 400);
    assert.equal(few.body.code, "BELOW_MIN_PURCHASE");
    await settings({ tokenMinPurchase: 1 });
    testGateway.set(await refOf(r.body.id), "paid");
    assert.equal((await verify(bob, r.body.id)).body.status, "paid");
    assert.equal(await balance(bob.id), 3);
  });

  test("the gateway reports another amount: nothing is credited", async () => {
    const r = await call("POST", "/payments/tokens", { token: bob.token, body: { tokens: 20 } });
    testGateway.set(await refOf(r.body.id), "paid", 5);
    const checked = await verify(bob, r.body.id);
    assert.equal(checked.body.status, "failed");
    assert.equal(await balance(bob.id), 3);
    const [row] = await q("select failure_reason from payments where id = $1", [r.body.id]);
    assert.equal(row.failure_reason, "AMOUNT_MISMATCH");
  });

  test("a payment that failed or expired credits nothing, and stays closed", async () => {
    for (const outcome of ["failed", "expired"] as const) {
      const r = await call("POST", "/payments/tokens", { token: bob.token, body: { tokens: 7 } });
      const ref = await refOf(r.body.id);
      testGateway.set(ref, outcome);
      assert.equal((await verify(bob, r.body.id)).body.status, outcome);
      // The gateway changing its mind later changes nothing: the payment is closed
      testGateway.set(ref, "paid");
      assert.equal((await verify(bob, r.body.id)).body.status, outcome);
    }
    assert.equal(await balance(bob.id), 3);
  });

  test("the scheduler settles what the member never came back for, and closes old ones", async () => {
    const { reconcilePayments } = await import("../src/lib/payments");
    const paid = await call("POST", "/payments/tokens", { token: bob.token, body: { tokens: 2 } });
    const stale = await call("POST", "/payments/tokens", { token: bob.token, body: { tokens: 9 } });
    testGateway.set(await refOf(paid.body.id), "paid");
    // Opened a few minutes ago, and more than a day ago
    await q("update payments set created_at = now() - interval '5 minutes' where id = $1", [
      paid.body.id,
    ]);
    await q("update payments set created_at = now() - interval '2 days' where id = $1", [
      stale.body.id,
    ]);
    assert.equal(await reconcilePayments(), 2);
    assert.equal(await balance(bob.id), 5);
    const rows = await q("select id, status from payments where id = any($1) order by id", [
      [paid.body.id, stale.body.id],
    ]);
    assert.deepEqual(
      rows.map((r) => r.status),
      ["paid", "expired"],
    );
    assert.equal(await reconcilePayments(), 0, "nothing left to settle");
  });

  test("the gateway's callback for an unknown reference is answered like any other", async () => {
    for (const [method, path] of [
      ["GET", "/payments/webhook/konnect?payment_ref=does-not-exist"],
      ["GET", "/payments/webhook/flouci?payment_id=does-not-exist"],
      ["POST", "/payments/webhook/flouci"],
    ] as const) {
      const r = await call(method, path, method === "POST" ? { body: { payment_id: "nope" } } : {});
      assert.equal(r.status, 200, path);
      assert.deepEqual(r.body, { ok: true });
    }
  });
});

describe("paying a boutique order", () => {
  let orderId: number;
  let paymentId: number;
  const order = (who: Member, quantity = 2) =>
    call("POST", "/shop/orders", {
      token: who.token,
      body: { deliveryMethod: "pickup", items: [{ productId: balls, quantity }] },
    });

  test("the order's own total is what is paid; only by its owner", async () => {
    const o = await order(alice);
    assert.equal(o.status, 201);
    orderId = o.body.id;
    const stranger = await call("POST", `/payments/orders/${orderId}`, { token: bob.token });
    assert.equal(stranger.status, 404, "another member's order looks like no order");
    const r = await call("POST", `/payments/orders/${orderId}`, {
      token: alice.token,
      body: { amount: 0.01 },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    paymentId = r.body.id;
    assert.equal(r.body.amount, 36);
    assert.equal(r.body.shopOrderId, orderId);
  });

  test("paid: the order is marked paid, the desk has nothing to collect", async () => {
    testGateway.set(await refOf(paymentId), "paid");
    assert.equal((await verify(alice, paymentId)).body.status, "paid");
    const [o] = await q("select paid_online_at, status from shop_orders where id = $1", [orderId]);
    assert.ok(o.paid_online_at);
    assert.equal(o.status, "pending", "the club still calls to confirm");
    const again = await call("POST", `/payments/orders/${orderId}`, { token: alice.token });
    assert.equal(again.status, 409);
    assert.equal(again.body.code, "ALREADY_PAID");
    const list = await call("GET", "/admin/shop/orders", { token: admin.token });
    const row = list.body.data.find((x: { id: number }) => x.id === orderId);
    assert.deepEqual(
      row.payments.map((p: { status: string; amount: number }) => [p.status, p.amount]),
      [["paid", 36]],
    );
  });

  test("handed over: it is in the online lines of the report, not in the cash", async () => {
    for (const status of ["confirmed", "delivered"])
      await call("PATCH", `/admin/shop/orders/${orderId}`, {
        token: admin.token,
        body: { status },
      });
    const report = await call("GET", `/admin/reports/cash?from=${today()}&to=${today()}`, {
      token: admin.token,
    });
    assert.equal(report.body.totals.orders, 0, "no cash was taken for it");
    assert.equal(report.body.totals.total, 0);
    // 250 + 75 + 50 of tokens, 36 of boutique
    assert.equal(report.body.totals.online, 411);
    const line = report.body.lines.find((l: { label: string }) => l.label === `Order #${orderId}`);
    assert.equal(line.kind, "online");
    assert.equal(line.operator, "test");
  });

  test("the desk cancels a paid order: the money is owed back until the desk says it refunded", async () => {
    const o = await order(alice, 1);
    const p = await call("POST", `/payments/orders/${o.body.id}`, { token: alice.token });
    testGateway.set(await refOf(p.body.id), "paid");
    await verify(alice, p.body.id);
    const cancelled = await call("PATCH", `/admin/shop/orders/${o.body.id}`, {
      token: admin.token,
      body: { status: "cancelled" },
    });
    assert.equal(cancelled.status, 200);
    assert.equal(
      (await call("GET", `/payments/${p.body.id}`, { token: alice.token })).body.status,
      "refund_due",
    );
    const due = await call("GET", "/admin/payments?status=refund_due", { token: admin.token });
    assert.equal(due.body.refundDue, 1);
    assert.equal(due.body.data[0].id, p.body.id);
    assert.equal(due.body.data[0].member.name, "Alice Ben Salah");
    assert.ok(
      due.body.data[0].providerRef,
      "the desk gets the reference to refund in the back-office",
    );

    // A member never marks a refund, nor reads the desk's list
    assert.equal(
      (await call("POST", `/admin/payments/${p.body.id}/refunded`, { token: alice.token })).status,
      403,
    );
    assert.equal((await call("GET", "/admin/payments", { token: alice.token })).status, 403);

    const done = await call("POST", `/admin/payments/${p.body.id}/refunded`, {
      token: admin.token,
    });
    assert.equal(done.body.status, "refunded");
    const twice = await call("POST", `/admin/payments/${p.body.id}/refunded`, {
      token: admin.token,
    });
    assert.equal(twice.status, 200, "pressed twice: still refunded, recorded once");
    const [row] = await q("select refunded_by, refunded_at from payments where id = $1", [
      p.body.id,
    ]);
    assert.equal(row.refunded_by, admin.id);
    assert.ok(row.refunded_at);
    const trail = await q("select id from activity where message like $1", [
      `Online payment #${p.body.id} refunded%`,
    ]);
    assert.equal(trail.length, 1);
    // A payment that was never owed back cannot be marked refunded
    const none = await call("POST", `/admin/payments/${paymentId}/refunded`, {
      token: admin.token,
    });
    assert.equal(none.body.code, "NOTHING_TO_REFUND");
  });

  test("paid after the desk cancelled the order: owed back, the order stays cancelled", async () => {
    const o = await order(bob, 1);
    const p = await call("POST", `/payments/orders/${o.body.id}`, { token: bob.token });
    await call("PATCH", `/admin/shop/orders/${o.body.id}`, {
      token: admin.token,
      body: { status: "cancelled" },
    });
    testGateway.set(await refOf(p.body.id), "paid");
    assert.equal((await verify(bob, p.body.id)).body.status, "refund_due");
    const [row] = await q("select status, paid_online_at from shop_orders where id = $1", [
      o.body.id,
    ]);
    assert.deepEqual(row, { status: "cancelled", paid_online_at: null });
    // A cancelled or delivered order can no longer be paid
    const late = await call("POST", `/payments/orders/${o.body.id}`, { token: bob.token });
    assert.equal(late.body.code, "ORDER_CLOSED");
  });
});

describe("the two gateways, against a server answering like their documentation", () => {
  let server: http.Server;
  let base: string;
  const seen: { method: string; url: string; headers: http.IncomingHttpHeaders; body: any }[] = [];
  let answer: (req: { method: string; url: string }) => { status?: number; json: unknown };

  before(async () => {
    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const entry = {
          method: req.method ?? "",
          url: req.url ?? "",
          headers: req.headers,
          body: raw ? JSON.parse(raw) : null,
        };
        seen.push(entry);
        const { status = 200, json } = answer(entry);
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(json));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v2`;
  });
  after(() => new Promise((r) => server.close(r)));

  const input = {
    paymentId: 42,
    amount: 12.5,
    description: "Padel Club · Pack 10",
    successUrl: "https://club.test/wallet?payment=42",
    failUrl: "https://club.test/wallet?payment=42",
    webhookUrl: "https://api.club.test/api/payments/webhook/konnect",
    customer: { firstName: "Alice", lastName: "Ben Salah", email: "alice@test.tn", phone: null },
  };

  test("Konnect: the amount goes in millimes to the club's wallet; completed means paid", async () => {
    const gateway = konnect({ apiUrl: base, apiKey: "key-123", walletId: "wallet-abc" });
    seen.length = 0;
    answer = () => ({
      json: { payUrl: "https://gateway.test/pay?payment_ref=ref-1", paymentRef: "ref-1" },
    });
    const opened = await gateway.init(input);
    assert.deepEqual(opened, { ref: "ref-1", url: "https://gateway.test/pay?payment_ref=ref-1" });
    const [sent] = seen;
    assert.equal(sent.method, "POST");
    assert.equal(sent.url, "/api/v2/payments/init-payment");
    assert.equal(sent.headers["x-api-key"], "key-123");
    assert.equal(sent.body.receiverWalletId, "wallet-abc");
    assert.equal(sent.body.amount, 12500);
    assert.equal(sent.body.token, "TND");
    assert.equal(sent.body.orderId, "42");
    assert.equal(sent.body.webhook, input.webhookUrl);

    answer = () => ({ json: { payment: { status: "completed", amount: 12500, token: "TND" } } });
    assert.deepEqual(await gateway.status("ref-1"), { status: "paid", amount: 12.5 });
    assert.equal(seen.at(-1)?.url, "/api/v2/payments/ref-1");
    answer = () => ({ json: { payment: { status: "pending", amount: 12500 } } });
    assert.equal((await gateway.status("ref-1")).status, "pending");
    answer = () => ({
      json: { payment: { status: "pending", amount: 12500, expirationDate: "2020-10-15" } },
    });
    assert.equal((await gateway.status("ref-1")).status, "expired");
  });

  test("Flouci: both keys in the bearer, the amount in millimes; SUCCESS means paid", async () => {
    const gateway = flouci({ apiUrl: base, publicKey: "pub", privateKey: "priv" });
    seen.length = 0;
    answer = () => ({
      json: {
        result: { success: true, payment_id: "pay-9", link: "https://checkout.test/club/pay-9" },
        code: 0,
      },
    });
    const opened = await gateway.init({ ...input, webhookUrl: null });
    assert.deepEqual(opened, { ref: "pay-9", url: "https://checkout.test/club/pay-9" });
    const [sent] = seen;
    assert.equal(sent.url, "/api/v2/generate_payment");
    assert.equal(sent.headers.authorization, "Bearer pub:priv");
    assert.equal(sent.body.amount, "12500");
    assert.equal(sent.body.developer_tracking_id, "42");
    assert.equal(sent.body.success_link, input.successUrl);
    assert.ok(!("webhook" in sent.body), "no callback address when the API has none");

    for (const [status, expected] of [
      ["SUCCESS", "paid"],
      ["PENDING", "pending"],
      ["EXPIRED", "expired"],
      ["FAILURE", "failed"],
      ["SYSTEM_FAILURE", "failed"],
    ] as const) {
      answer = () => ({ json: { success: true, result: { status, amount: 12500 } } });
      assert.deepEqual(await gateway.status("pay-9"), { status: expected, amount: 12.5 });
    }
    assert.equal(seen.at(-1)?.url, "/api/v2/verify_payment/pay-9");
  });

  test("a gateway that is down or answers nonsense is a clean refusal, never a crash", async () => {
    const gateway = konnect({ apiUrl: base, apiKey: "k", walletId: "w" });
    answer = () => ({ status: 500, json: { error: "boom" } });
    await assert.rejects(gateway.init(input), { code: "PAYMENT_PROVIDER_ERROR", status: 502 });
    answer = () => ({ json: { payUrl: "javascript:alert(1)", paymentRef: "x" } });
    await assert.rejects(gateway.init(input));
    const dead = konnect({ apiUrl: "http://127.0.0.1:9/api/v2", apiKey: "k", walletId: "w" });
    await assert.rejects(dead.status("ref"), { code: "PAYMENT_PROVIDER_ERROR" });
  });
});
