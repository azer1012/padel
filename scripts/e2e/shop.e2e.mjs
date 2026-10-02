/**
 * The boutique from both sides: the admin puts articles on sale, a member fills a
 * cart and orders without paying, the desk sees who to call, confirms and hands the
 * order over, and the member follows it. Also: a visitor's cart survives sign-in
 * being asked, stock is never oversold, and the shop can be switched off.
 */
import {
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
const { yasmine: A, karim: B, admin: ADMIN } = USERS;
const stock = async (name) =>
  (await sql("select stock from shop_products where name = $1", [name]))[0]?.stock;

// ════════════════════════════════════════════════════════════════════════════
section("The admin fills the shop");
const admin = await as(ADMIN);

await step("an empty shop says so, to the admin and to visitors", async () => {
  await admin.page.goto(`${WEB}/admin/shop`);
  await admin.page.getByText("Aucun article en vente").waitFor({ timeout: 15000 });
  await admin.page.getByText("Aucune commande en attente d'appel.").waitFor();
  const v = await as(null);
  await v.page.goto(`${WEB}/boutique`);
  await v.page.getByText("La boutique se remplit bientôt").waitFor({ timeout: 15000 });
  await v.ctx.close();
});

await step("the admin adds two articles from the form", async () => {
  for (const [name, price, qty, category] of [
    ["Raquette Carbone Pro", "349.9", "2", "Raquettes"],
    ["Tube de 3 balles", "18", "10", "Balles"],
  ]) {
    await admin.page.getByTestId("btn-create-product").click();
    const dialog = admin.page.getByRole("dialog");
    await dialog.locator("#sp-name").fill(name);
    await dialog.locator("#sp-category").click();
    await admin.page.getByRole("option", { name: category }).click();
    await dialog.locator("#sp-price").fill(price);
    await dialog.locator("#sp-stock").fill(qty);
    await dialog.locator("#sp-image").fill("/club-detail-960.webp");
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await admin.page.getByText("Article ajouté").first().waitFor({ timeout: 10000 });
    await dialog.waitFor({ state: "hidden" });
  }
  equal(await stock("Raquette Carbone Pro"), 2, "racket stock");
  equal(await stock("Tube de 3 balles"), 10, "balls stock");
  await shot(admin.page, "shop-01-admin-catalogue");
});

// ════════════════════════════════════════════════════════════════════════════
section("A member orders");

await step("a visitor fills a cart, and is asked to sign in only to order", async () => {
  const v = await as(null);
  await v.page.goto(`${WEB}/boutique`);
  await v.page.getByRole("button", { name: "Ajouter Tube de 3 balles au panier" }).click();
  await v.page.getByTestId("btn-cart").click();
  const dialog = v.page.getByRole("dialog");
  await dialog.getByText("Connectez-vous pour commander").waitFor();
  await dialog.getByTestId("btn-place-order").click();
  await v.page.waitForURL(/\/sign-in\?redirect=%2Fboutique/, { timeout: 10000 });
  equal((await sql("select count(*)::int as n from shop_orders"))[0].n, 0, "orders");
  await v.ctx.close();
});

const a = await as(A);
let orderId;
await step("the cart shows the total; the order needs a phone number", async () => {
  await a.page.goto(`${WEB}/boutique`);
  await a.page.getByRole("button", { name: "Ajouter Raquette Carbone Pro au panier" }).click();
  await a.page.getByRole("button", { name: "Ajouter Tube de 3 balles au panier" }).click();
  // A second tube, from the article's own stepper
  await a.page
    .getByRole("group", { name: "Quantité de Tube de 3 balles" })
    .getByRole("button", { name: "Ajouter un" })
    .click();
  await a.page.getByTestId("btn-cart").click();
  const dialog = a.page.getByRole("dialog");
  equal((await dialog.getByTestId("cart-total").innerText()).trim(), "385.90 TND", "cart total");
  await shot(a.page, "shop-02-cart");
  await dialog.locator("#order-phone").fill("12");
  await dialog.getByTestId("btn-place-order").click();
  await dialog
    .getByRole("alert")
    .getByText(/numéro de téléphone valide/)
    .waitFor();
  equal((await sql("select count(*)::int as n from shop_orders"))[0].n, 0, "orders");
});

await step("ordering takes the stock, empties the cart and says the club will call", async () => {
  const dialog = a.page.getByRole("dialog");
  await dialog.locator("#order-phone").fill("+216 20 123 456");
  await dialog.getByRole("radio", { name: "Livraison" }).click();
  // Buttons ignore a second press within half a second of the first (double-click
  // protection): nobody corrects a form that fast, a test does
  await a.page.waitForTimeout(600);
  await dialog.locator("#order-address").fill("12 rue des Jasmins");
  await dialog.locator("#order-city").fill("Tunis");
  // Confirm pressed twice: one order
  await dialog.getByTestId("btn-place-order").dblclick();
  await dialog.getByTestId("order-done").waitFor({ timeout: 15000 });
  await dialog.getByText(/Le club vous appelle au \+216 20 123 456/).waitFor();
  await shot(a.page, "shop-03-order-sent");
  const orders = await sql("select id, total, status, user_id from shop_orders");
  equal(orders.length, 1, "orders created");
  orderId = orders[0].id;
  equal(orders[0].total, "385.90", "total decided by the server");
  equal(orders[0].status, "pending", "state");
  equal(orders[0].user_id, A.n, "owner");
  equal(await stock("Raquette Carbone Pro"), 1, "racket stock");
  equal(await stock("Tube de 3 balles"), 8, "balls stock");
  await dialog.getByRole("button", { name: "Voir mes commandes" }).click();
  await a.page.getByTestId(`order-${orderId}`).getByText("En attente d'appel").waitFor();
  equal(
    await a.page
      .getByTestId("btn-cart")
      .innerText()
      .then((t) => /\d/.test(t)),
    false,
    "cart emptied",
  );
});

await step("nobody is sold what is not there, whatever the browser says", async () => {
  const tooMany = await api(B, "POST", "/shop/orders", {
    deliveryMethod: "pickup",
    contactPhone: "+216 55 000 111",
    items: [{ productId: 1, quantity: 5 }],
  });
  equal(tooMany.status, 409, "status");
  equal(tooMany.body.code, "OUT_OF_STOCK", "code");
  const cheap = await api(B, "POST", "/shop/orders", {
    deliveryMethod: "pickup",
    contactPhone: "+216 55 000 111",
    items: [{ productId: 2, quantity: 1, price: 0.01 }],
    total: 0.01,
  });
  equal(cheap.status, 201, "order");
  equal(cheap.body.total, 18, "price from the catalogue");
  const peek = await api(B, "POST", `/shop/orders/${orderId}/cancel`);
  equal(peek.status, 404, "another member's order");
});

// ════════════════════════════════════════════════════════════════════════════
section("The desk handles the order");

await step("the admin is notified and sees who to call, with the phone number", async () => {
  const notes = await sql(
    "select message from notifications where user_id = $1 and type = 'order_placed'",
    [ADMIN.n],
  );
  assert(notes.length >= 1, "no notification for the admin");
  await admin.page.goto(`${WEB}/admin/shop`);
  const card = admin.page.getByTestId(`admin-order-${orderId}`);
  await card.waitFor({ timeout: 15000 });
  await admin.page.getByTestId("pending-orders").getByText("2 à appeler").waitFor();
  const call = card.getByRole("link", { name: "+216 20 123 456" });
  equal(await call.getAttribute("href"), "tel:+21620123456", "call link");
  await card.getByText("385.90 TND").waitFor();
  await card.getByText(/12 rue des Jasmins, Tunis/).waitFor();
  await shot(admin.page, "shop-04-admin-order");
});

await step("confirmed by phone, sent, handed over: the member follows each step", async () => {
  const card = admin.page.getByTestId(`admin-order-${orderId}`);
  await admin.page.getByTestId(`confirm-order-${orderId}`).click();
  await admin.page.getByRole("radio", { name: "En cours" }).click();
  await card.getByText("Confirmée", { exact: true }).waitFor({ timeout: 10000 });
  await card.getByRole("button", { name: "Envoyée" }).click();
  await card.getByText("En route").waitFor({ timeout: 10000 });
  await card.getByRole("button", { name: "Remise et payée" }).click();
  await admin.page.getByRole("radio", { name: "Toutes" }).click();
  await card.getByText("Remise", { exact: true }).waitFor({ timeout: 10000 });
  equal(
    (await sql("select status from shop_orders where id = $1", [orderId]))[0].status,
    "delivered",
    "state",
  );
  await a.page.reload();
  await a.page.getByRole("radio", { name: /Mes commandes/ }).click();
  await a.page.getByTestId(`order-${orderId}`).getByText("Remise", { exact: true }).waitFor();
  const told = await sql(
    "select message from notifications where user_id = $1 and type = 'order_update'",
    [A.n],
  );
  equal(told.length, 4, "notices to the member (received, confirmed, on its way, delivered)");
});

await step("the desk cancelling an order gives the stock back and tells the member", async () => {
  const [other] = await sql("select id from shop_orders where user_id = $1", [B.n]);
  const before = await stock("Tube de 3 balles");
  await admin.page.getByRole("radio", { name: "À appeler" }).click();
  const card = admin.page.getByTestId(`admin-order-${other.id}`);
  await card.getByRole("button", { name: "Annuler" }).click();
  await admin.page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Annuler la commande" })
    .click();
  await admin.page.getByText("Aucune commande en attente d'appel.").waitFor({ timeout: 10000 });
  equal(await stock("Tube de 3 balles"), before + 1, "stock given back");
});

// ════════════════════════════════════════════════════════════════════════════
section("Phone and settings");

await step("the shop fits a phone, cart included", async () => {
  const m = await as(B, { width: 375, height: 800 });
  await m.page.goto(`${WEB}/boutique`);
  await m.page.getByRole("button", { name: "Ajouter Tube de 3 balles au panier" }).click();
  equal(await overflow(m.page), 0, "sideways scroll on the shop");
  await m.page.getByTestId("btn-cart").click();
  await m.page.getByRole("dialog").getByTestId("cart-total").waitFor();
  equal(await overflow(m.page), 0, "sideways scroll with the cart open");
  await shot(m.page, "shop-05-cart-mobile");
  equal(m.page.problems.length, 0, m.page.problems.join(" · "));
  await m.ctx.close();
});

await step("the stock moved under a cart: the line says so and the order waits", async () => {
  const c = await as(A);
  await c.page.goto(`${WEB}/boutique`);
  await c.page.getByRole("button", { name: "Ajouter Raquette Carbone Pro au panier" }).click();
  await c.page.getByRole("button", { name: "Ajouter Tube de 3 balles au panier" }).click();
  // Meanwhile the last racket is sold at the desk and the tubes are taken off sale
  await sql("update shop_products set stock = 0 where name = 'Raquette Carbone Pro'");
  await sql("update shop_products set is_active = false where name = 'Tube de 3 balles'");
  await c.page.reload();
  await c.page.getByTestId("btn-cart").getByText("1").waitFor({ timeout: 15000 });
  await c.page.getByTestId("btn-cart").click();
  const dialog = c.page.getByRole("dialog");
  await dialog.getByTestId("cart-line-short").getByText("Rupture de stock").waitFor();
  equal(await dialog.getByText("Tube de 3 balles").count(), 0, "article off sale left the cart");
  await dialog.locator("#order-phone").fill("+216 20 123 456");
  const before = (await sql("select count(*)::int as n from shop_orders"))[0].n;
  await dialog.getByTestId("btn-place-order").click();
  await dialog
    .getByRole("alert")
    .getByText(/plus assez en stock/)
    .waitFor();
  equal((await sql("select count(*)::int as n from shop_orders"))[0].n, before, "no order");
  equal(c.page.problems.length, 0, c.page.problems.join(" · "));
  await c.ctx.close();
  await sql("update shop_products set stock = 1 where name = 'Raquette Carbone Pro'");
  await sql("update shop_products set is_active = true where name = 'Tube de 3 balles'");
});

await step("an order arriving while the admin edits an article is never undone", async () => {
  await admin.page.goto(`${WEB}/admin/shop`);
  await admin.page.getByRole("button", { name: "Modifier Tube de 3 balles" }).click();
  const dialog = admin.page.getByRole("dialog");
  const seen = Number(await dialog.locator("#sp-stock").inputValue());
  // A member orders 2 tubes while the form is open
  const r = await api(A, "POST", "/shop/orders", {
    deliveryMethod: "pickup",
    contactPhone: "+216 20 123 456",
    items: [{ productId: 2, quantity: 2 }],
  });
  equal(r.status, 201, "order");
  await dialog.locator("#sp-stock").fill(String(seen + 10));
  await admin.page.waitForTimeout(600);
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await admin.page
    .getByText(/Le stock a changé pendant votre modification/)
    .first()
    .waitFor({
      timeout: 10000,
    });
  // That refusal is the point of this step: it is not a problem of the page
  const expected = admin.page.problems.filter((p) => /409 \(Conflict\)/.test(p));
  equal(expected.length, 1, "one refused save");
  admin.page.problems.splice(
    0,
    admin.page.problems.length,
    ...admin.page.problems.filter((p) => !expected.includes(p)),
  );
  equal(await stock("Tube de 3 balles"), seen - 2, "the order's stock kept");
  equal(await dialog.locator("#sp-stock").inputValue(), String(seen - 2), "current figure shown");
  // Saved again with the figure in front of them: it goes through
  await dialog.locator("#sp-stock").fill(String(seen + 10));
  await admin.page.waitForTimeout(600);
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await admin.page.getByText("Article mis à jour").first().waitFor({ timeout: 10000 });
  equal(await stock("Tube de 3 balles"), seen + 10, "new stock");
  equal((await api(A, "POST", `/shop/orders/${r.body.id}/cancel`)).status, 200, "cancel");
});

await step("switched off in Réglages: no shop in the menus, orders refused", async () => {
  equal((await api(ADMIN, "PATCH", "/admin/settings", { shopEnabled: false })).status, 200, "off");
  const v = await as(null, { width: 1440, height: 900 });
  await v.page.goto(`${WEB}/`);
  await v.page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Contact" })
    .waitFor();
  await v.page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Boutique" })
    .waitFor({ state: "detached", timeout: 10000 });
  await v.page.goto(`${WEB}/boutique`);
  await v.page.getByText("La boutique n'est pas ouverte").waitFor({ timeout: 15000 });
  await v.ctx.close();
  const refused = await api(A, "POST", "/shop/orders", {
    deliveryMethod: "pickup",
    contactPhone: "+216 20 123 456",
    items: [{ productId: 2, quantity: 1 }],
  });
  equal(refused.status, 403, "order while the shop is off");
  equal((await api(ADMIN, "PATCH", "/admin/settings", { shopEnabled: true })).status, 200, "on");
});

await step("the database is coherent at the end", async () => {
  equal((await sql("select id from shop_products where stock < 0")).length, 0, "negative stock");
  equal(
    (
      await sql(`select o.id from shop_orders o join shop_order_items i on i.order_id = o.id
                 group by o.id, o.total having o.total <> sum(i.unit_price * i.quantity)`)
    ).length,
    0,
    "totals that are not the sum of their lines",
  );
  equal(admin.page.problems.length, 0, admin.page.problems.join(" · "));
  equal(a.page.problems.length, 0, a.page.problems.join(" · "));
});

await finish();
