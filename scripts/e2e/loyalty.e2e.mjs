/**
 * Fidélité from both sides: the admin switches the programme on and sets the rule in
 * Réglages, a member sees what a booking will earn before confirming, the wallet
 * shows the progress, a whole token arrives in the balance, and a cancelled booking
 * takes its reward back.
 */
import {
  USERS,
  WEB,
  api,
  as,
  equal,
  finish,
  launch,
  openSlot,
  overflow,
  section,
  shot,
  slot,
  sql,
  step,
} from "./lib.mjs";

await launch();
const { yasmine: A, admin: ADMIN } = USERS;
const me = async () => (await api(A, "GET", "/users/me")).body;

await api(ADMIN, "POST", "/tokens/admin/adjust", {
  userId: A.n,
  type: "credit",
  amount: 20,
  description: "Recharge de test",
  idempotencyKey: "loyalty-a-20",
});

// ════════════════════════════════════════════════════════════════════════════
section("The admin sets the rule");
const admin = await as(ADMIN);

await step("off by default: nothing about loyalty is shown to a member", async () => {
  equal((await api(null, "GET", "/settings")).body.loyaltyEnabled, false, "default");
  const a = await as(A);
  await a.page.goto(`${WEB}/wallet`);
  await a.page.getByText("Votre solde").first().waitFor({ timeout: 15000 });
  equal(await a.page.getByTestId("loyalty-card").count(), 0, "loyalty card while off");
  await a.ctx.close();
});

await step("Réglages → Fidélité: switch on, set 1 token → 0.1, see what it means", async () => {
  await admin.page.goto(`${WEB}/admin/settings`);
  await admin.page.getByRole("button", { name: "Fidélité" }).click();
  const box = admin.page.locator("#loyalty");
  await box.getByTestId("toggle-loyalty").click();
  await box.locator("#set-loyalty-reward").fill("0.123");
  await box.getByRole("alert").getByText("2 décimales au maximum").waitFor();
  await box.locator("#set-loyalty-reward").fill("0.1");
  await box.locator("#set-loyalty-spend").fill("1");
  await box
    .getByTestId("loyalty-example")
    .getByText(
      /une place \(1 token\) rapporte 0\.1 token.*terrain complet \(4 tokens\) rapporte 0\.4 token/,
    )
    .waitFor();
  await shot(admin.page, "loyalty-01-settings");
  await box.getByTestId("btn-save-settings").click();
  await admin.page.getByText("Réglages enregistrés").first().waitFor({ timeout: 10000 });
  const s = (await api(null, "GET", "/settings")).body;
  equal(s.loyaltyEnabled, true, "enabled");
  equal(s.loyaltySpendTokens, 1, "tokens spent");
  equal(s.loyaltyRewardTokens, 0.1, "reward");
});

// ════════════════════════════════════════════════════════════════════════════
section("A member earns");
const a = await as(A);

await step("the booking dialog says what the booking earns, before confirming", async () => {
  await a.page.goto(`${WEB}/terrains`);
  const dialog = await openSlot(a.page, "Court Central", "18:30");
  await dialog.getByTestId("loyalty-line").getByText("+0.4 token").waitFor({ timeout: 10000 });
  await dialog.getByRole("radio", { name: /Juste ma place/ }).click();
  await dialog.getByTestId("loyalty-line").getByText("+0.1 token").waitFor();
  await dialog.getByRole("radio", { name: /Terrain complet/ }).click();
  await shot(a.page, "loyalty-02-book-dialog");
  await dialog.getByRole("button", { name: "Confirmer la réservation" }).click();
  await dialog.getByText("Réservation confirmée").waitFor({ timeout: 10000 });
  const u = await me();
  equal(u.tokenBalance, 16, "tokens");
  equal(u.loyaltyBalance, 0.4, "reward earned");
});

await step("the wallet shows the progress towards the next free token", async () => {
  await a.page.goto(`${WEB}/wallet`);
  const card = a.page.getByTestId("loyalty-card");
  await card.getByText("0.4 / 1 token de récompense").waitFor({ timeout: 15000 });
  equal(await card.getByRole("progressbar").getAttribute("aria-valuenow"), "40", "progress");
  await card.getByText(/vous rapporte 0\.1 token pour 1 token dépensé/).waitFor();
  await shot(a.page, "loyalty-03-wallet");
});

let second;
await step("reaching 1: a token is added to the balance and listed in the history", async () => {
  for (const hhmm of ["08:00", "09:30"]) {
    second = await api(A, "POST", "/reservations", {
      terrainId: 2,
      startTime: slot(hhmm, 2),
      bookingMode: "full_court",
    });
    equal(second.status, 201, `booking ${hhmm}`);
  }
  equal(second.body.loyalty.credited, 1, "token credited by the third booking");
  const u = await me();
  // 16 − 4 − 4 + 1 reward
  equal(u.tokenBalance, 9, "tokens");
  equal(u.loyaltyBalance, 0.2, "what is left of the reward");
  await a.page.reload();
  await a.page.getByTestId("loyalty-card").getByText("0.2 / 1 token de récompense").waitFor();
  await a.page.getByText("Récompense fidélité").first().waitFor();
  equal(await a.page.getByText("Loyalty reward").count(), 0, "English ledger wording");
  const told = await sql(
    "select message from notifications where user_id = $1 and type = 'tokens_added' and message like '%Récompense fidélité%'",
    [A.n],
  );
  equal(told.length, 1, "notification of the reward token");
});

await step("a cancelled booking gives its tokens back and takes its reward back", async () => {
  const cancel = await api(A, "POST", `/reservations/${second.body.id}/cancel`);
  equal(cancel.status, 200, "cancel");
  const u = await me();
  equal(u.tokenBalance, 13, "tokens refunded");
  // 0.2 − 0.4: the reward of that booking had already become a token
  equal(u.loyaltyBalance, -0.2, "reward owed");
  await a.page.reload();
  const card = a.page.getByTestId("loyalty-card");
  await card.getByText("0 / 1 token de récompense").waitFor({ timeout: 15000 });
  await card.getByText(/il reste 0\.2 à regagner/).waitFor();
});

await step("the wallet fits a phone, and nothing went wrong behind the pages", async () => {
  const m = await as(A, { width: 375, height: 800 });
  await m.page.goto(`${WEB}/wallet`);
  await m.page.getByTestId("loyalty-card").waitFor({ timeout: 15000 });
  equal(await overflow(m.page), 0, "sideways scroll");
  await shot(m.page, "loyalty-04-wallet-mobile");
  equal(m.page.problems.length, 0, m.page.problems.join(" · "));
  await m.ctx.close();
  equal(
    (await sql("select * from token_ledger_audit")).length,
    0,
    "balances that don't match the ledger",
  );
  equal(admin.page.problems.length, 0, admin.page.problems.join(" · "));
  equal(a.page.problems.length, 0, a.page.problems.join(" · "));
});

await finish();
