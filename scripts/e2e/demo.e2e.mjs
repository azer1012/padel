/**
 * The public demo (API with DEMO_MODE, empty base: the API creates the demo club at
 * start-up). A prospect lands on the site, sees it is a demo and who made it, tries
 * it as a player and as the club with one tap each, and nothing they do survives the
 * next reset.
 */
import {
  API,
  CRON_SECRET,
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
const signOut = async (page) => {
  await page.goto(`${WEB}/profile`);
  await page.getByRole("button", { name: "Se déconnecter" }).last().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/profile"), { timeout: 15000 });
};

// ════════════════════════════════════════════════════════════════════════════
section("A prospect arrives");
const v = await as(null);

await step("the demo club is ready, and every page says it is a demo", async () => {
  equal((await sql("select count(*)::int as n from terrains"))[0].n, 4, "courts");
  equal(
    (await sql("select count(*)::int as n from users where email not ilike '%@example.com'"))[0].n,
    0,
    "real people",
  );
  await v.page.goto(`${WEB}/`);
  const banner = v.page.getByTestId("demo-banner");
  await banner
    .getByText(/Club fictif : tout revient à zéro chaque nuit à 4\sh/)
    .waitFor({ timeout: 15000 });
  await banner.getByTestId("demo-contact").click();
  const dialog = v.page.getByRole("dialog");
  await dialog.getByText("Contacter AmiVio").waitFor();
  equal(
    await dialog.getByRole("link", { name: /WhatsApp/ }).getAttribute("href"),
    "https://wa.me/21623653160",
    "WhatsApp link",
  );
  await v.page.keyboard.press("Escape");
  await shot(v.page, "demo-01-home");
});

await step("sign-in and sign-up offer the two demo accounts instead of a form", async () => {
  for (const path of ["/sign-in", "/sign-up"]) {
    await v.page.goto(`${WEB}${path}`);
    const box = v.page.getByTestId("demo-sign-in");
    await box.getByText("Essayez la plateforme").waitFor({ timeout: 15000 });
    await box.getByTestId("demo-enter-player").waitFor();
    await box.getByTestId("demo-enter-admin").waitFor();
    equal(await v.page.locator("#email").count(), 0, `e-mail form on ${path}`);
    equal(await v.page.getByText("Créer un compte").count(), 0, `sign-up link on ${path}`);
  }
  await shot(v.page, "demo-02-sign-in");
});

// ════════════════════════════════════════════════════════════════════════════
section("As a player");

await step("one tap: signed in as the demo player, with tokens and bookings", async () => {
  await v.page.getByTestId("demo-enter-player").click();
  await v.page.waitForURL(/\/dashboard/, { timeout: 15000 });
  await v.page.getByTestId("demo-banner").waitFor();
  await v.page.goto(`${WEB}/wallet`);
  await v.page.getByText("Votre solde").first().waitFor({ timeout: 15000 });
  const [me] = await sql("select token_balance from users where email = 'joueur@example.com'");
  equal(me.token_balance > 0, true, "tokens to play with");
  await v.page.getByTestId("loyalty-card").waitFor();
  await v.page.getByTestId("wallet-packs").getByText("Pack 10 · 10 tokens").waitFor();
});

await step("the shared account's password can't be changed from the profile", async () => {
  await v.page.goto(`${WEB}/profile`);
  await v.page.getByText("Compte de démonstration partagé").waitFor({ timeout: 15000 });
  equal(await v.page.getByRole("button", { name: "Changer le mot de passe" }).count(), 0, "button");
  await signOut(v.page);
});

// ════════════════════════════════════════════════════════════════════════════
section("As the club");

await step("one tap: the admin side, with invented members only and fixed roles", async () => {
  await v.page.goto(`${WEB}/sign-in`);
  await v.page.getByTestId("demo-enter-admin").click();
  await v.page.waitForURL(/\/admin/, { timeout: 15000 });
  await v.page.goto(`${WEB}/admin/users`);
  await v.page.getByText("Yasmine Trabelsi").first().waitFor({ timeout: 15000 });
  equal(await v.page.getByRole("button", { name: /accès admin/ }).count(), 0, "role buttons");
  await shot(v.page, "demo-03-admin-members");
  await v.page.goto(`${WEB}/admin/shop`);
  await v.page.getByTestId("pending-orders").getByText("1 à appeler").waitFor({ timeout: 15000 });
});

await step("whatever the visitor changes is back after the reset", async () => {
  await sql("update terrains set name = 'Terrain cassé' where number = 1");
  const res = await fetch(`${API}/internal/demo/reset`, {
    method: "POST",
    headers: { "x-cron-secret": CRON_SECRET },
  });
  equal(res.status, 200, "reset");
  equal((await sql("select name from terrains where number = 1"))[0].name, "Court Central", "name");
  // The shared accounts still sign in after a reset
  await signOut(v.page);
  await v.page.goto(`${WEB}/sign-in`);
  await v.page.getByTestId("demo-enter-player").click();
  await v.page.waitForURL(/\/dashboard/, { timeout: 15000 });
  equal(v.page.problems.length, 0, v.page.problems.join(" · "));
  await v.ctx.close();
});

// ════════════════════════════════════════════════════════════════════════════
section("On a phone");

await step("the banner and the demo sign-in fit a phone", async () => {
  const m = await as(null, { width: 375, height: 800 });
  await m.page.goto(`${WEB}/`);
  await m.page.getByTestId("demo-banner").waitFor({ timeout: 15000 });
  equal(await overflow(m.page), 0, "sideways scroll on the home page");
  await shot(m.page, "demo-04-home-mobile");
  await m.page.goto(`${WEB}/sign-in`);
  await m.page.getByTestId("demo-enter-admin").waitFor({ timeout: 15000 });
  equal(await overflow(m.page), 0, "sideways scroll on the sign-in");
  await shot(m.page, "demo-05-sign-in-mobile");
  equal(m.page.problems.length, 0, m.page.problems.join(" · "));
  await m.ctx.close();
  equal((await sql("select * from token_ledger_audit")).length, 0, "ledger");
});

await finish();
