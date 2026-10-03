/**
 * Online payment from both sides, through the stand-in gateway of the test suites
 * (PAYMENT_PROVIDER=test: its "payment page" pays and sends the member back, nothing
 * leaves the machine). A member buys a pack and loose tokens from the wallet, pays a
 * boutique order at checkout and another one later; a payment that fails charges
 * nothing; the desk sees what is already paid, and what it owes back after cancelling.
 */
import {
  API,
  CRON_SECRET,
  USERS,
  WEB,
  api,
  as,
  assert,
  equal,
  finish,
  launch,
  overflow,
  section,
  shot,
  sql,
  step,
} from "./lib.mjs";

await launch();
const { yasmine: A, admin: ADMIN } = USERS;
const balance = async (u) => (await api(u, "GET", "/users/me")).body.tokenBalance;
/** What the next payment opened on the stand-in page becomes. */
const next = (outcome) =>
  fetch(`${API}/internal/payments/test/next`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-cron-secret": CRON_SECRET },
    body: JSON.stringify({ outcome }),
  });
/** Back on the site after the payment page, with the outcome told to the member. */
async function returned(page, status) {
  const banner = page.getByTestId("payment-return");
  await banner.waitFor({ timeout: 20000 });
  await page.waitForFunction(
    (want) => document.querySelector('[data-testid="payment-return"]')?.dataset.status === want,
    status,
    { timeout: 20000 },
  );
  equal(new URL(page.url()).search, "", "the address is cleaned after the return");
  return banner;
}

const [pack] = await sql("select id, price from token_packages where tokens = 10");
const product = await api(ADMIN, "POST", "/admin/shop/products", {
  name: "Tube de 3 balles",
  category: "balls",
  price: 18,
  stock: 10,
});
equal(product.status, 201, "article");

// ════════════════════════════════════════════════════════════════════════════
section("Buying tokens from the wallet");
const a = await as(A);

await step("the wallet offers to pay online, pack by pack", async () => {
  equal((await api(null, "GET", "/settings")).body.onlinePayment.enabled, true, "online payment");
  await a.page.goto(`${WEB}/wallet`);
  await a.page.getByText("Rechargez en ligne, ou à l'accueil.").waitFor({ timeout: 15000 });
  await a.page.getByTestId(`btn-buy-pack-${pack.id}`).waitFor();
  await shot(a.page, "payments-01-wallet");
});

await step("a pack is paid on the payment page: the tokens are there on return", async () => {
  await a.page.getByTestId(`btn-buy-pack-${pack.id}`).click();
  const banner = await returned(a.page, "paid");
  await banner.getByText(/Paiement reçu : 10 tokens ajoutés/).waitFor();
  equal(await balance(A), 10, "balance");
  await a.page
    .getByText(/Achat en ligne/)
    .first()
    .waitFor({ timeout: 10000 });
  await shot(a.page, "payments-02-paid");
  const [p] = await sql(
    "select status, amount, tokens, provider from payments where user_id = $1",
    [A.n],
  );
  equal(p.status, "paid", "payment");
  equal(p.amount, pack.price, "amount: the pack's price");
  // A reload asks nothing again and credits nothing twice
  await a.page.reload();
  await a.page.getByTestId("wallet-history").waitFor({ timeout: 15000 });
  equal(await a.page.getByTestId("payment-return").count(), 0, "banner after a reload");
  equal(await balance(A), 10, "balance after a reload");
});

await step("loose tokens cost the club's token price, shown before paying", async () => {
  await a.page.getByTestId("input-buy-tokens").fill("3");
  await a.page.getByText("75 TND").waitFor();
  await a.page.getByTestId("btn-buy-tokens").click();
  await returned(a.page, "paid");
  equal(await balance(A), 13, "balance");
});

await step("a payment that does not go through charges nothing, and says so", async () => {
  equal((await next("failed")).status, 200, "next payment fails");
  await a.page.getByTestId(`btn-buy-pack-${pack.id}`).click();
  const banner = await returned(a.page, "failed");
  await banner.getByText(/n'a pas abouti : rien n'a été débité/).waitFor();
  equal(await balance(A), 13, "balance");
  equal((await next("paid")).status, 200, "back to paying");
  // The page told the member; the refusal is not a problem of the page
  a.page.problems.length = 0;
});

// ════════════════════════════════════════════════════════════════════════════
section("Paying a boutique order");
let paidOrder;

await step(
  "at checkout: ordered, paid, and back on the orders with nothing left to pay",
  async () => {
    await a.page.goto(`${WEB}/boutique`);
    await a.page.getByRole("button", { name: "Ajouter Tube de 3 balles au panier" }).click();
    await a.page.getByTestId("btn-cart").click();
    const dialog = a.page.getByRole("dialog");
    await dialog.locator("#order-phone").fill("+216 20 123 456");
    await dialog.getByRole("radio", { name: "En ligne maintenant" }).click();
    await a.page.waitForTimeout(600);
    await shot(a.page, "payments-03-checkout");
    await dialog.getByRole("button", { name: "Commander et payer 18 TND" }).click();
    const banner = await returned(a.page, "paid");
    await banner.getByText(/est payée/).waitFor();
    const [o] = await sql("select id, status, paid_online_at from shop_orders where user_id = $1", [
      A.n,
    ]);
    paidOrder = o.id;
    assert(o.paid_online_at, "order not marked paid");
    equal(o.status, "pending", "the club still calls to confirm");
    const card = a.page.getByTestId(`order-${paidOrder}`);
    await card.getByText("Payée en ligne", { exact: true }).waitFor({ timeout: 15000 });
    equal(await card.getByTestId(`btn-pay-order-${paidOrder}`).count(), 0, "pay button once paid");
  },
);

await step("an order placed to pay on reception can be paid online later", async () => {
  const later = await api(A, "POST", "/shop/orders", {
    deliveryMethod: "pickup",
    contactPhone: "+216 20 123 456",
    items: [{ productId: product.body.id, quantity: 2 }],
  });
  equal(later.status, 201, "order");
  await a.page.goto(`${WEB}/boutique`);
  await a.page.getByRole("radio", { name: /Mes commandes/ }).click();
  await a.page.getByTestId(`btn-pay-order-${later.body.id}`).click();
  await returned(a.page, "paid");
  const [p] = await sql("select status, amount from payments where shop_order_id = $1", [
    later.body.id,
  ]);
  equal(p.status, "paid", "payment");
  equal(p.amount, "36.00", "amount: the order's total");
});

// ════════════════════════════════════════════════════════════════════════════
section("The desk");
const desk = await as(ADMIN);

await step("a paid order has nothing to collect; cancelled, its money is owed back", async () => {
  await desk.page.goto(`${WEB}/admin/shop`);
  const card = desk.page.getByTestId(`admin-order-${paidOrder}`);
  await card.getByText("Payée en ligne", { exact: true }).waitFor({ timeout: 15000 });
  await card.getByText("Déjà payée en ligne : rien à encaisser").waitFor();
  await card.getByRole("button", { name: "Annuler" }).click();
  const confirm = desk.page.getByRole("alertdialog");
  await confirm.getByText(/vous devrez lui rembourser 18 TND/).waitFor();
  await confirm.getByRole("button", { name: "Annuler la commande" }).click();
  const [p] = await sql("select id, status from payments where shop_order_id = $1", [paidOrder]);
  for (let i = 0; i < 50; i++) {
    if ((await sql("select status from payments where id = $1", [p.id]))[0].status !== "paid")
      break;
    await desk.page.waitForTimeout(100);
  }
  equal(
    (await sql("select status from payments where id = $1", [p.id]))[0].status,
    "refund_due",
    "payment after the cancellation",
  );
  // The order left "to call": it is in the full list, with what is owed
  await desk.page.getByRole("radio", { name: "Toutes" }).click();
  const refund = desk.page.getByTestId(`refund-${p.id}`);
  await refund.getByText(/18 TND payés en ligne à rembourser/).waitFor({ timeout: 15000 });
  await shot(desk.page, "payments-04-refund-due");
  await refund.getByRole("button", { name: "Remboursement effectué" }).click();
  await desk.page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Oui, c'est remboursé" })
    .click();
  await refund.getByText(/18 TND remboursés au membre/).waitFor({ timeout: 15000 });
  const [done] = await sql("select status, refunded_by from payments where id = $1", [p.id]);
  equal(done.status, "refunded", "payment after the refund");
  equal(done.refunded_by, ADMIN.n, "who refunded");
});

await step("the cash report keeps what was paid online apart from the till", async () => {
  await desk.page.goto(`${WEB}/admin/cash`);
  const totals = desk.page.getByTestId("cash-totals");
  await totals.getByText("Payé en ligne (hors caisse)").waitFor({ timeout: 15000 });
  // 250 + 75 of tokens, 36 for the order still paid (the refunded one no longer counts)
  await totals.getByText("361").waitFor();
  await desk.page.getByText("En ligne").first().waitFor();
});

await step(
  "switched off in Réglages: the wallet goes back to the desk, the API refuses",
  async () => {
    await desk.page.goto(`${WEB}/admin/settings`);
    const row = desk.page.getByTestId("toggle-online-payment");
    await row.waitFor({ timeout: 15000 });
    equal(
      (await api(ADMIN, "PATCH", "/admin/settings", { onlinePaymentEnabled: false })).status,
      200,
      "off",
    );
    await a.page.goto(`${WEB}/wallet`);
    await a.page.getByText("Rechargez à l'accueil ou par téléphone.").waitFor({ timeout: 15000 });
    equal(await a.page.locator('[data-testid^="btn-buy-pack-"]').count(), 0, "pay buttons");
    const refused = await api(A, "POST", "/payments/tokens", { packageId: pack.id });
    equal(refused.status, 403, "status");
    equal(refused.body.code, "FEATURE_DISABLED", "code");
    equal(
      (await api(ADMIN, "PATCH", "/admin/settings", { onlinePaymentEnabled: true })).status,
      200,
      "on again",
    );
  },
);

await step(
  "on a phone: the wallet with its pay buttons fits, nothing went wrong behind the pages",
  async () => {
    const m = await as(A, { width: 375, height: 800 });
    await m.page.goto(`${WEB}/wallet`);
    await m.page.getByTestId(`btn-buy-pack-${pack.id}`).waitFor({ timeout: 15000 });
    equal(await overflow(m.page), 0, "sideways scroll");
    await shot(m.page, "payments-05-wallet-mobile");
    await m.ctx.close();
    equal(
      [...a.page.problems, ...desk.page.problems].length,
      0,
      [...a.page.problems, ...desk.page.problems].slice(0, 4).join(" · "),
    );
    // Every payment that credited tokens credited them once
    equal(
      (
        await sql(
          "select count(*)::int as n from token_transactions where idempotency_key like 'payment:%'",
        )
      )[0].n,
      2,
      "ledger entries of online purchases",
    );
    equal((await sql("select count(*)::int as n from token_ledger_audit"))[0].n, 0, "ledger audit");
  },
);

await finish();
