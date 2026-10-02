/**
 * Token packs from both sides: the admin changes, adds, takes off sale and deletes
 * packs in Réglages → Tokens, and visitors see the packs on sale in the home page
 * prices (with the regular price and the discount), members in their wallet.
 * The test club sells a token 25 TND and starts with Pack 10 = 250, 20 = 480, 50 = 1150.
 */
import {
  USERS,
  WEB,
  as,
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
const pack = async (name) =>
  (
    await sql(
      "select tokens, price::float as price, is_active from token_packages where name = $1",
      [name],
    )
  )[0];

// ════════════════════════════════════════════════════════════════════════════
section("The admin sets the packs");
const admin = await as(ADMIN);
const packs = () => admin.page.getByTestId("token-packs");

await step("Réglages → Tokens: Pack 10 goes from 250 to 200, shown as 20 % off", async () => {
  await admin.page.goto(`${WEB}/admin/settings`);
  await admin.page.getByRole("button", { name: "Tokens", exact: true }).click();
  const row = packs().getByTestId("pack-row").filter({ hasText: "Pack 10" });
  await row.getByText("sans réduction").waitFor({ timeout: 15000 });
  await row.getByRole("button", { name: "Modifier Pack 10" }).click();
  const form = packs().getByTestId("pack-edit");
  await form.getByLabel(/Prix du pack/).fill("200");
  await form.getByText("au lieu de").waitFor();
  await form.getByText("250 TND").waitFor();
  await form.getByText(/20 %/).waitFor();
  await form.getByRole("button", { name: "Enregistrer" }).click();
  await admin.page.getByText("Pack modifié").first().waitFor({ timeout: 10000 });
  const saved = packs().getByTestId("pack-row").filter({ hasText: "Pack 10" });
  await saved.getByText(/20 %/).waitFor();
  equal((await pack("Pack 10")).price, 200, "price saved");
  await shot(admin.page, "packs-01-settings");
});

await step(
  "a pack is added with a preview of its discount, then deleted after a confirmation",
  async () => {
    const form = packs().getByTestId("pack-new");
    await form.getByLabel("Nom du pack").fill("Pack Découverte");
    await form.getByLabel("Nombre de tokens").fill("5");
    await form.getByLabel(/Prix du pack/).fill("0");
    equal(await form.getByRole("button", { name: "Ajouter" }).isDisabled(), true, "free pack");
    await form.getByLabel(/Prix du pack/).fill("120");
    await form.getByText("125 TND").waitFor();
    await form.getByRole("button", { name: "Ajouter" }).click();
    await admin.page.getByText("Pack ajouté").first().waitFor({ timeout: 10000 });
    equal((await pack("Pack Découverte"))?.price, 120, "added");
    equal(await form.getByLabel("Nom du pack").inputValue(), "", "form emptied");

    const row = packs().getByTestId("pack-row").filter({ hasText: "Pack Découverte" });
    await row.getByRole("button", { name: "Supprimer Pack Découverte" }).click();
    const confirm = admin.page.getByRole("alertdialog");
    await confirm.getByText("Supprimer « Pack Découverte » ?").waitFor();
    await confirm.getByRole("button", { name: "Supprimer" }).click();
    await admin.page.getByText("Pack supprimé").first().waitFor({ timeout: 10000 });
    equal(await pack("Pack Découverte"), undefined, "deleted");
  },
);

await step("Pack 20 taken off sale", async () => {
  const row = packs().getByTestId("pack-row").filter({ hasText: "Pack 20" });
  await row.getByRole("switch").click();
  for (let i = 0; i < 20 && (await pack("Pack 20")).is_active; i++)
    await admin.page.waitForTimeout(250);
  equal((await pack("Pack 20")).is_active, false, "off sale");
});

// ════════════════════════════════════════════════════════════════════════════
section("Players see them");

await step(
  "the home page prices show the packs on sale, their regular price and discount",
  async () => {
    const v = await as(null);
    await v.page.goto(`${WEB}/`);
    const block = v.page.getByTestId("home-packs");
    await block.scrollIntoViewIfNeeded({ timeout: 15000 });
    await block.getByText("Packs de tokens").waitFor();
    equal(await block.getByText("Pack 20").count(), 0, "a pack off sale is not shown");
    const ten = block.locator("li").filter({ hasText: "Pack 10" });
    await ten.getByText("200 TND").waitFor();
    await ten.getByText("250 TND").waitFor();
    await ten.getByText(/20 %/).waitFor();
    // 200 / 10 = 20 a token beats 1150 / 50 = 23
    await ten.getByText("Le meilleur prix : 20 TND le token").waitFor();
    const fifty = block.locator("li").filter({ hasText: "Pack 50" });
    await fifty.getByText("1150 TND").waitFor();
    await fifty.getByText("1250 TND").waitFor();
    await fifty.getByText(/8 %/).waitFor();
    await v.page.waitForTimeout(800);
    await shot(v.page, "packs-02-home");
    equal(v.page.problems.length, 0, v.page.problems.join(" · "));
    await v.ctx.close();
  },
);

await step("a member sees them where they top up, in the wallet", async () => {
  const a = await as(A);
  await a.page.goto(`${WEB}/wallet`);
  const list = a.page.getByTestId("wallet-packs");
  await list.getByText("Pack 10 · 10 tokens").waitFor({ timeout: 15000 });
  await list.getByText("200 TND").waitFor();
  equal(await list.getByText("Pack 20").count(), 0, "off sale");
  equal(a.page.problems.length, 0, a.page.problems.join(" · "));
  await a.ctx.close();
});

await step("no packs on sale: the block disappears; everything fits a phone", async () => {
  await sql("update token_packages set is_active = false");
  const v = await as(null, { width: 375, height: 800 });
  await v.page.goto(`${WEB}/`);
  await v.page.getByText("= 1 place.").first().waitFor({ timeout: 15000 });
  equal(await v.page.getByTestId("home-packs").count(), 0, "packs block without packs");
  await sql("update token_packages set is_active = true where name in ('Pack 10', 'Pack 50')");
  await v.page.reload();
  const block = v.page.getByTestId("home-packs");
  await block.scrollIntoViewIfNeeded({ timeout: 15000 });
  equal(await overflow(v.page), 0, "sideways scroll");
  await v.page.waitForTimeout(800);
  await shot(v.page, "packs-03-home-mobile");
  equal(v.page.problems.length, 0, v.page.problems.join(" · "));
  await v.ctx.close();
  equal(admin.page.problems.length, 0, admin.page.problems.join(" · "));
});

// Back to the seeded packs for the suites that run after this one
await sql("update token_packages set is_active = true, price = 250 where name = 'Pack 10'");
await sql("update token_packages set is_active = true");

await finish();
