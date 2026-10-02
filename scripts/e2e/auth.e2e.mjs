/**
 * Accounts in a real browser: who gets in, who is kept out, and what each
 * mistake looks like. Supabase Auth is the local stand-in (auth-stub.mjs), so the
 * forms, the session handling and the API checks are the production code, while
 * the delivery of real e-mails is not covered here (docs/TESTING.md).
 */
import {
  API,
  PASSWORD,
  USERS,
  WEB,
  api,
  as,
  assert,
  auth,
  equal,
  finish,
  launch,
  section,
  shot,
  step,
  token,
} from "./lib.mjs";

await launch();

const PRIVATE = ["/dashboard", "/reservations", "/wallet", "/profile"];
const ADMIN = [
  "/admin",
  "/admin/reservations",
  "/admin/terrains",
  "/admin/users",
  "/admin/tokens",
  "/admin/news",
  "/admin/tournaments",
  "/admin/pricing",
  "/admin/equipment",
  "/admin/settings",
];
const NEW = {
  email: "player.a@e2e.test",
  password: "Smash2026ok",
  first: "Amel",
  last: "Trabelsi",
};

/** Requests the page sent to the auth service since the last call. */
function authCalls(page) {
  const calls = [];
  page.on("request", (r) => {
    if (r.url().includes("/auth/v1/") && r.method() !== "OPTIONS")
      calls.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  return calls;
}

/**
 * Presses a submit button the way a person does: not within the half second in
 * which the button takes two clicks for one press (double-click protection).
 */
async function press(button) {
  await button.page().waitForTimeout(550);
  await button.click();
}

async function signIn(page, email, password, path = "/sign-in") {
  await page.goto(WEB + path);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
}

section("Visitors are kept out of private pages");
const v = await as(null);

await step(
  "every member page sends a visitor to sign-in and remembers where they were going",
  async () => {
    for (const route of [...PRIVATE, ...ADMIN]) {
      await v.page.goto(WEB + route);
      await v.page.waitForURL(/\/sign-in\?redirect=/, { timeout: 10000 });
      equal(
        new URL(v.page.url()).searchParams.get("redirect"),
        route,
        `redirect kept for ${route}`,
      );
      await v.page.locator("#email").waitFor();
    }
  },
);

await step("no private request is answered without a session", async () => {
  for (const path of [
    "/users/me",
    "/reservations",
    "/reservations/upcoming",
    "/tokens/balance",
    "/tokens/transactions",
    "/notifications",
    "/invites",
    "/members/search?q=yas",
    "/users",
    "/tokens/admin/transactions",
    "/admin/settings",
    "/dashboard/stats",
  ]) {
    const r = await api(null, "GET", path);
    equal(r.status, 401, `GET ${path} as a visitor`);
    equal(r.body.code, "UNAUTHORIZED", `code of GET ${path}`);
  }
});

await step("the public pages stay open: home, planning, tournaments, news, contact", async () => {
  for (const route of ["/", "/terrains", "/tournaments", "/news", "/contact", "/open-matches"]) {
    await v.page.goto(WEB + route);
    await v.page.getByRole("heading").first().waitFor({ timeout: 10000 });
    assert(!/sign-in/.test(v.page.url()), `${route} redirected to sign-in`);
  }
  equal(v.page.problems.length, 0, `problems: ${v.page.problems.join(" | ")}`);
});

section("Sign-up");
const s = await as(null);
const calls = authCalls(s.page);

await step("an empty form, a bad e-mail and a weak password never leave the browser", async () => {
  await s.page.goto(`${WEB}/sign-up`);
  const submit = s.page.getByRole("button", { name: "Créer mon compte" });
  await press(submit);
  assert(
    await s.page.locator("#first-name").evaluate((el) => !el.validity.valid),
    "empty first name accepted",
  );
  await s.page.locator("#first-name").fill(NEW.first);
  await s.page.locator("#last-name").fill(NEW.last);
  await s.page.locator("#email").fill("not-an-email");
  await s.page.locator("#password").fill(NEW.password);
  await press(submit);
  assert(
    await s.page.locator("#email").evaluate((el) => el.validity.typeMismatch),
    "bad e-mail accepted",
  );
  await s.page.locator("#email").fill(NEW.email);
  // The phone is required: without it the browser stops the form before the password check
  await s.page.locator("#phone").fill("+216 20 123 456");
  for (const weak of ["abcdefghij", "1234567890", "abc123"]) {
    await s.page.locator("#password").fill(weak);
    await press(submit);
    if (weak.length >= 8)
      await s.page
        .getByRole("alert")
        .getByText(/Mot de passe trop faible/)
        .waitFor({ timeout: 5000 });
  }
  equal(calls.length, 0, `requests sent: ${calls.join(", ")}`);
});

await step("a valid sign-up shows “check your inbox” and creates the profile once", async () => {
  await s.page.locator("#password").fill(NEW.password);
  const submit = s.page.getByRole("button", { name: "Créer mon compte" });
  await s.page.locator("#phone").fill("12");
  await press(submit);
  await s.page.getByRole("alert").getByText("Entrez un numéro de téléphone valide.").waitFor();
  await s.page.locator("#phone").fill("+216 20 123 456");
  await press(submit);
  await s.page.getByRole("alert").getByText("Indiquez votre genre.").waitFor();
  equal(calls.length, 0, `requests sent before the form was complete: ${calls.join(", ")}`);
  await s.page.getByRole("radio", { name: "Femme" }).click();
  await press(submit);
  await s.page
    .getByRole("heading", { name: "Vérifiez votre boîte mail" })
    .waitFor({ timeout: 10000 });
  await s.page.getByText(NEW.email).waitFor();
  await shot(s.page, "auth-01-check-inbox");
  const found = await api(USERS.admin, "GET", `/users?search=${encodeURIComponent(NEW.email)}`);
  equal(found.body.total, 1, "profiles for the new e-mail");
  const profile = found.body.data[0];
  equal(profile.firstName, NEW.first, "first name");
  equal(profile.gender, "female", "gender from sign-up");
  equal(profile.lastName, NEW.last, "last name");
  equal(profile.role, "player", "role");
  equal(profile.tokenBalance, 0, "starting balance");
});

await step("signing in before confirming is refused, with a way to resend the e-mail", async () => {
  const p = await as(null);
  await signIn(p.page, NEW.email, NEW.password);
  await p.page
    .getByRole("alert")
    .getByText(/Confirmez d'abord votre email/)
    .waitFor({ timeout: 10000 });
  await p.page.getByRole("button", { name: "Renvoyer l'email de confirmation" }).click();
  await p.page.getByText("Email de confirmation renvoyé.").waitFor({ timeout: 10000 });
  assert(/\/sign-in/.test(p.page.url()), "left the sign-in page");
  await p.ctx.close();
});

let confirmLink = "";
await step("the confirmation link signs the new member in", async () => {
  confirmLink = await auth.mail(NEW.email);
  assert(confirmLink, "no confirmation e-mail was produced");
  await s.page.goto(confirmLink);
  await s.page.waitForURL(/\/dashboard/, { timeout: 15000 });
  await s.page.getByRole("heading", { name: new RegExp(NEW.first) }).waitFor({ timeout: 15000 });
  await shot(s.page, "auth-02-confirmed-dashboard");
});

await step("a confirmation link can't be used twice", async () => {
  const p = await as(null);
  await p.page.goto(confirmLink);
  await p.page.getByRole("heading", { name: "Lien non valide" }).waitFor({ timeout: 15000 });
  await p.page
    .getByRole("alert")
    .getByText(/Ce lien a expiré/)
    .waitFor();
  await p.page.getByRole("link", { name: "Retour à la connexion" }).click();
  await p.page.waitForURL(/\/sign-in$/, { timeout: 10000 });
  await p.ctx.close();
});

await step("a confirmation link opened on another device signs the member in there", async () => {
  const laptop = await as(null);
  await laptop.page.goto(`${WEB}/sign-up?redirect=%2Fwallet`);
  await laptop.page.locator("#first-name").fill("Bilel");
  await laptop.page.locator("#last-name").fill("Gharbi");
  await laptop.page.locator("#email").fill("player.b@e2e.test");
  await laptop.page.locator("#password").fill(NEW.password);
  await laptop.page.locator("#phone").fill("+216 20 000 111");
  await laptop.page.getByRole("radio", { name: "Homme" }).click();
  await laptop.page.getByRole("button", { name: "Créer mon compte" }).click();
  await laptop.page
    .getByRole("heading", { name: "Vérifiez votre boîte mail" })
    .waitFor({ timeout: 10000 });
  const phone = await as(null, { width: 390, height: 844 });
  await phone.page.goto(await auth.mail("player.b@e2e.test"));
  await phone.page.waitForURL(/\/wallet$/, { timeout: 15000 });
  await phone.page.getByText("Votre solde").first().waitFor({ timeout: 10000 });
  await phone.ctx.close();
  await laptop.ctx.close();
});

await step(
  "the older link format still works in the browser that asked, and says so when expired",
  async () => {
    const q = await as(null);
    await q.page.goto(`${WEB}/sign-up`);
    await q.page.locator("#first-name").fill("Chaima");
    await q.page.locator("#last-name").fill("Mansour");
    await q.page.locator("#email").fill("player.c@e2e.test");
    await q.page.locator("#password").fill(NEW.password);
    await q.page.locator("#phone").fill("+216 20 000 111");
    await q.page.getByRole("radio", { name: "Homme" }).click();
    await q.page.getByRole("button", { name: "Créer mon compte" }).click();
    await q.page
      .getByRole("heading", { name: "Vérifiez votre boîte mail" })
      .waitFor({ timeout: 10000 });
    const legacy = await auth.mail("player.c@e2e.test", "legacy");
    await q.page.goto(legacy);
    await q.page.waitForURL(/\/dashboard$/, { timeout: 15000 });
    await q.page.getByRole("heading", { name: /Chaima/ }).waitFor({ timeout: 15000 });
    await q.ctx.close();
    const again = await as(null);
    await again.page.goto(legacy);
    await again.page.waitForURL(/\/sign-in\?/, { timeout: 15000 });
    await again.page
      .getByRole("alert")
      .getByText(/Ce lien a expiré/)
      .waitFor({ timeout: 10000 });
    await again.ctx.close();
  },
);

await step("signing up again with a taken e-mail reveals nothing and creates nothing", async () => {
  const p = await as(null);
  await p.page.goto(`${WEB}/sign-up`);
  await p.page.locator("#first-name").fill("Someone");
  await p.page.locator("#last-name").fill("Else");
  await p.page.locator("#email").fill(NEW.email);
  await p.page.locator("#password").fill("Another2026pw");
  await p.page.locator("#phone").fill("+216 20 000 111");
  await p.page.getByRole("radio", { name: "Homme" }).click();
  await p.page.getByRole("button", { name: "Créer mon compte" }).click();
  await p.page
    .getByRole("heading", { name: "Vérifiez votre boîte mail" })
    .waitFor({ timeout: 10000 });
  const found = await api(USERS.admin, "GET", `/users?search=${encodeURIComponent(NEW.email)}`);
  equal(found.body.total, 1, "profiles for the e-mail");
  equal(found.body.data[0].firstName, NEW.first, "name of the existing account");
  await p.ctx.close();
});

section("Sign-in");
const p = await as(null);

await step("a wrong password and an unknown e-mail get the same answer", async () => {
  await signIn(p.page, NEW.email, "Wrong2026pass");
  const alert = p.page.getByRole("alert");
  await alert.getByText("Email ou mot de passe incorrect.").waitFor({ timeout: 10000 });
  const first = await alert.innerText();
  await signIn(p.page, "nobody@e2e.test", "Wrong2026pass");
  await alert.getByText("Email ou mot de passe incorrect.").waitFor({ timeout: 10000 });
  equal(await alert.innerText(), first, "message for an unknown e-mail");
  assert(/\/sign-in/.test(p.page.url()), "left the sign-in page");
});

await step("a suspended account is told so, in plain words", async () => {
  await auth.account({ email: USERS.ines.email, banned: true });
  await signIn(p.page, USERS.ines.email, PASSWORD);
  await p.page
    .getByRole("alert")
    .getByText(/Ce compte est suspendu/)
    .waitFor({ timeout: 10000 });
  await auth.account({ email: USERS.ines.email, banned: false });
});

await step("the right password opens the page the member was going to", async () => {
  await p.page.goto(`${WEB}/wallet`);
  await p.page.waitForURL(/\/sign-in\?redirect=%2Fwallet/, { timeout: 10000 });
  await p.page.locator("#email").fill(NEW.email);
  await p.page.locator("#password").fill(NEW.password);
  await p.page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await p.page.waitForURL(/\/wallet$/, { timeout: 15000 });
  await p.page.getByText("Votre solde").first().waitFor({ timeout: 10000 });
});

await step("a redirect to another website is ignored", async () => {
  for (const target of ["//evil.example", "https://evil.example/x", "javascript:alert(1)"]) {
    const q = await as(null);
    await signIn(
      q.page,
      NEW.email,
      NEW.password,
      `/sign-in?redirect=${encodeURIComponent(target)}`,
    );
    await q.page.waitForURL(/\/dashboard$/, { timeout: 15000 });
    assert(q.page.url().startsWith(WEB), `left the site for ${q.page.url()}`);
    await q.ctx.close();
  }
});

await step(
  "the session survives a reload and a new tab; sign-in pages send a member home",
  async () => {
    await p.page.reload();
    await p.page.getByText("Votre solde").first().waitFor({ timeout: 10000 });
    const tab = await p.ctx.newPage();
    await tab.goto(`${WEB}/dashboard`);
    await tab.getByRole("heading", { name: new RegExp(NEW.first) }).waitFor({ timeout: 15000 });
    await tab.goto(`${WEB}/sign-in`);
    await tab.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await tab.goto(`${WEB}/sign-up`);
    await tab.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await tab.close();
  },
);

await step("a player is sent away from every admin page", async () => {
  for (const route of ADMIN) {
    await p.page.goto(WEB + route);
    await p.page.waitForURL(/\/dashboard$/, { timeout: 10000 });
  }
  await p.page.getByRole("heading", { name: new RegExp(NEW.first) }).waitFor({ timeout: 10000 });
});

section("Profile");

await step("profile edits are saved and still there after a reload", async () => {
  await p.page.goto(`${WEB}/profile`);
  const first = p.page.getByTestId("input-first-name");
  await first.waitFor({ timeout: 10000 });
  equal(await first.inputValue(), NEW.first, "first name shown");
  equal(
    await p.page.getByTestId("input-phone").inputValue(),
    "+216 20 123 456",
    "phone from sign-up",
  );
  await first.fill("Amélie");
  await p.page.getByTestId("input-phone").fill("+216 98 765 432");
  await p.page.getByTestId("btn-save-profile").click();
  await p.page.getByText("Profil enregistré").first().waitFor({ timeout: 10000 });
  await p.page.reload();
  await first.waitFor({ timeout: 10000 });
  equal(await first.inputValue(), "Amélie", "first name after reload");
  equal(
    await p.page.getByTestId("input-phone").inputValue(),
    "+216 98 765 432",
    "phone after reload",
  );
  await shot(p.page, "auth-03-profile");
});

await step("a phone number that isn't one is refused and nothing changes", async () => {
  await p.page.getByTestId("input-phone").fill("call me maybe");
  await p.page.getByTestId("btn-save-profile").click();
  await p.page.getByText("Erreur d'enregistrement").first().waitFor({ timeout: 10000 });
  await p.page.reload();
  await p.page.getByTestId("input-phone").waitFor({ timeout: 10000 });
  equal(await p.page.getByTestId("input-phone").inputValue(), "+216 98 765 432", "phone kept");
});

section("Sign-out and expired sessions");

await step("signing out closes the private pages, even with the back button", async () => {
  await p.page.goto(`${WEB}/wallet`);
  await p.page.getByText("Votre solde").first().waitFor({ timeout: 10000 });
  await p.page.goto(`${WEB}/dashboard`);
  await p.page.getByTestId("btn-sign-out").click();
  await p.page.waitForURL(/\/sign-in/, { timeout: 10000 });
  equal(
    await p.page.evaluate(() => localStorage.getItem("padel-club-auth")),
    null,
    "session left in the browser",
  );
  await p.page.goBack();
  await p.page.waitForURL(/\/sign-in/, { timeout: 10000 });
  assert(!(await p.page.getByText("Votre solde").count()), "wallet still shown after sign-out");
  for (const route of PRIVATE) {
    await p.page.goto(WEB + route);
    await p.page.waitForURL(/\/sign-in\?redirect=/, { timeout: 10000 });
  }
});

await step("the next member on the same browser never sees the previous one's data", async () => {
  await signIn(p.page, USERS.karim.email, PASSWORD);
  await p.page.waitForURL(/\/dashboard$/, { timeout: 15000 });
  await p.page.getByRole("heading", { name: /Karim/ }).waitFor({ timeout: 15000 });
  await p.page.goto(`${WEB}/profile`);
  await p.page.getByTestId("input-first-name").waitFor({ timeout: 10000 });
  equal(await p.page.getByTestId("input-first-name").inputValue(), "Karim", "profile shown");
  assert(!(await p.page.getByText(NEW.email).count()), "previous member's e-mail on screen");
  await p.page.getByRole("button", { name: "Se déconnecter" }).first().click();
  await p.page.waitForURL(/\/sign-in/, { timeout: 10000 });
});

await step(
  "an expired session that can't be renewed returns to sign-in, not to a broken page",
  async () => {
    const stale = await as(null);
    const { jwt } = token(USERS.karim, { ttl: -60 });
    await stale.ctx.addInitScript((access_token) => {
      if (sessionStorage.getItem("stale-set")) return;
      sessionStorage.setItem("stale-set", "1");
      localStorage.setItem(
        "padel-club-auth",
        JSON.stringify({
          access_token,
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) - 60,
          refresh_token: "revoked-refresh-token",
          user: { id: "22222222-2222-2222-2222-222222222222", email: "karim@test.tn" },
        }),
      );
    }, jwt);
    await stale.page.goto(`${WEB}/dashboard`);
    await stale.page.waitForURL(/\/sign-in/, { timeout: 15000 });
    await stale.page.locator("#email").waitFor();
    await stale.ctx.close();
  },
);

await step("an expired session with a valid refresh token is renewed silently", async () => {
  const res = await fetch(
    `${process.env.AUTH_BASE ?? "http://127.0.0.1:54400"}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: USERS.karim.email, password: PASSWORD }),
    },
  );
  const session = await res.json();
  const renew = await as(null);
  await renew.ctx.addInitScript(
    ([s, expired]) => {
      if (sessionStorage.getItem("renew-set")) return;
      sessionStorage.setItem("renew-set", "1");
      localStorage.setItem(
        "padel-club-auth",
        JSON.stringify({
          ...s,
          access_token: expired,
          expires_at: Math.floor(Date.now() / 1000) - 60,
        }),
      );
    },
    [session, token(USERS.karim, { ttl: -60 }).jwt],
  );
  await renew.page.goto(`${WEB}/dashboard`);
  await renew.page.getByRole("heading", { name: /Karim/ }).waitFor({ timeout: 15000 });
  await renew.ctx.close();
});

section("Forgotten password");
const r = await as(null);
const resetCalls = authCalls(r.page);

await step(
  "asking without an e-mail explains what to do; an unknown e-mail gets the same answer as a real one",
  async () => {
    await r.page.goto(`${WEB}/sign-in`);
    await r.page.getByRole("button", { name: "Mot de passe oublié ?" }).click();
    await r.page
      .getByRole("alert")
      .getByText(/Entrez d'abord votre email/)
      .waitFor({ timeout: 5000 });
    equal(resetCalls.length, 0, "requests sent without an e-mail");
    await r.page.locator("#email").fill("nobody@e2e.test");
    await r.page.getByRole("button", { name: "Mot de passe oublié ?" }).click();
    await r.page
      .getByRole("status")
      .getByText(/Si un compte existe pour nobody@e2e.test/)
      .waitFor({ timeout: 10000 });
    equal(await auth.mail("nobody@e2e.test"), null, "e-mail for an unknown address");
    await r.page.locator("#email").fill(NEW.email);
    await r.page.getByRole("button", { name: "Mot de passe oublié ?" }).click();
    await r.page
      .getByRole("status")
      .getByText(new RegExp(`Si un compte existe pour ${NEW.email}`))
      .waitFor({ timeout: 10000 });
  },
);

const NEW_PASSWORD = "Bandeja2026ok";
let resetLink = "";
await step("the link opens the new-password form, which checks both fields", async () => {
  resetLink = await auth.mail(NEW.email);
  assert(/type=recovery/.test(resetLink), `reset link: ${resetLink}`);
  await r.page.goto(resetLink);
  await r.page.waitForURL(/\/reset-password/, { timeout: 15000 });
  const pw = r.page.locator("#new-password");
  const confirm = r.page.locator("#confirm-password");
  await pw.waitFor({ timeout: 15000 });
  const save = r.page.getByRole("button", { name: "Enregistrer le mot de passe" });
  await pw.fill("abcdefghij");
  await confirm.fill("abcdefghij");
  await press(save);
  await r.page
    .getByRole("alert")
    .getByText(/Mot de passe trop faible/)
    .waitFor({ timeout: 5000 });
  await pw.fill(NEW_PASSWORD);
  await confirm.fill(`${NEW_PASSWORD}x`);
  await press(save);
  await r.page
    .getByRole("alert")
    .getByText(/ne correspondent pas/)
    .waitFor({ timeout: 5000 });
  await pw.fill(NEW.password);
  await confirm.fill(NEW.password);
  await press(save);
  await r.page
    .getByRole("alert")
    .getByText(/différent de l'ancien/)
    .waitFor({ timeout: 10000 });
  await shot(r.page, "auth-04-reset-form");
});

await step("a new password is saved and opens the dashboard", async () => {
  await r.page.locator("#new-password").fill(NEW_PASSWORD);
  await r.page.locator("#confirm-password").fill(NEW_PASSWORD);
  await press(r.page.getByRole("button", { name: "Enregistrer le mot de passe" }));
  await r.page.getByRole("heading", { name: "Mot de passe changé" }).waitFor({ timeout: 10000 });
  await r.page.waitForURL(/\/dashboard$/, { timeout: 10000 });
  await r.page.getByTestId("btn-sign-out").click();
  await r.page.waitForURL(/\/sign-in/, { timeout: 10000 });
});

await step("the old password no longer works, the new one does", async () => {
  await signIn(r.page, NEW.email, NEW.password);
  await r.page
    .getByRole("alert")
    .getByText("Email ou mot de passe incorrect.")
    .waitFor({ timeout: 10000 });
  await signIn(r.page, NEW.email, NEW_PASSWORD);
  await r.page.waitForURL(/\/dashboard$/, { timeout: 15000 });
  await r.page.getByTestId("btn-sign-out").click();
  await r.page.waitForURL(/\/sign-in/, { timeout: 10000 });
});

await step("a used or invalid reset link says so and offers the way back", async () => {
  await r.page.goto(resetLink);
  await r.page.getByRole("heading", { name: "Lien non valide" }).waitFor({ timeout: 15000 });
  await r.page.getByText(/Ce lien a expiré/).waitFor({ timeout: 10000 });
  await r.page.getByRole("link", { name: "Retour à la connexion" }).waitFor();
  await r.page.goto(`${WEB}/auth/confirm?token_hash=made-up&type=recovery`);
  await r.page.getByText(/Ce lien a expiré/).waitFor({ timeout: 10000 });
  await r.page.goto(`${WEB}/auth/confirm`);
  await r.page.getByRole("heading", { name: "Lien non valide" }).waitFor({ timeout: 10000 });
  await r.page.goto(`${WEB}/reset-password`);
  await r.page.getByText(/Ce lien n'est plus valide/).waitFor({ timeout: 10000 });
});

await step("a link opened on another device still lets the member finish", async () => {
  await r.page.goto(`${WEB}/sign-in`);
  await r.page.locator("#email").fill(NEW.email);
  await r.page.getByRole("button", { name: "Mot de passe oublié ?" }).click();
  await r.page.getByRole("status").waitFor({ timeout: 10000 });
  const link = await auth.mail(NEW.email);
  const phone = await as(null, { width: 390, height: 844 });
  await phone.page.goto(link);
  await phone.page.waitForURL(/\/reset-password/, { timeout: 15000 });
  await phone.page.locator("#new-password").waitFor({ timeout: 15000 });
  await phone.page.locator("#new-password").fill("Vibora2026ok");
  await phone.page.locator("#confirm-password").fill("Vibora2026ok");
  await phone.page.getByRole("button", { name: "Enregistrer le mot de passe" }).click();
  await phone.page
    .getByRole("heading", { name: "Mot de passe changé" })
    .waitFor({ timeout: 10000 });
  await shot(phone.page, "auth-05-reset-other-device");
  await phone.ctx.close();
});

section("Access tokens");

await step(
  "missing, malformed, forged, expired and wrong-audience tokens are all refused",
  async () => {
    const good = token(USERS.karim).jwt;
    const [h, b] = good.split(".");
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${b}.`;
    const cases = {
      "no header": null,
      "empty bearer": "",
      "not a token": "not-a-token",
      "two parts": `${h}.${b}`,
      "bad signature": `${h}.${b}.AAAA`,
      "alg none": none,
      "another secret": token(USERS.karim, { secret: "another-secret-another-secret-123456" }).jwt,
      expired: token(USERS.karim, { ttl: -1 }).jwt,
      "service audience": token(USERS.karim, { claims: { aud: "service_role" } }).jwt,
      "unknown member": token({ id: "99999999-9999-9999-9999-999999999999", email: "x@e2e.test" })
        .jwt,
    };
    for (const [name, bearer] of Object.entries(cases)) {
      const res = await api(bearer, "GET", "/users/me");
      equal(res.status, 401, `status for "${name}"`);
      const text = JSON.stringify(res.body);
      assert(
        !/stack|at \w+ \(|node_modules|postgres|select /i.test(text),
        `"${name}" leaks: ${text}`,
      );
    }
    equal((await api(good, "GET", "/users/me")).status, 200, "a valid token");
  },
);

await step("a role claimed in the token or in the request never makes an admin", async () => {
  const forged = token(USERS.karim, {
    claims: { role: "service_role", app_metadata: { role: "admin" }, user_role: "admin" },
  }).jwt;
  equal((await api(forged, "GET", "/users")).status, 403, "admin list with a forged role claim");
  const patch = await api(USERS.karim, "PATCH", "/users/me", {
    role: "admin",
    tokenBalance: 999,
    token_balance: 999,
    id: USERS.admin.n,
  });
  equal(patch.status, 200, "profile patch");
  const me = (await api(USERS.karim, "GET", "/users/me")).body;
  equal(me.role, "player", "role after the patch");
  equal(me.tokenBalance, 0, "balance after the patch");
  equal(me.id, USERS.karim.n, "id after the patch");
  const sync = await api(USERS.karim, "POST", "/users/sync", {
    role: "admin",
    email: USERS.admin.email,
  });
  equal(sync.body.role, "player", "role after sync");
  equal(sync.body.email, USERS.karim.email, "e-mail after sync");
});

await step("the health check answers without revealing anything", async () => {
  const res = await fetch(`${API}/healthz`);
  equal(res.status, 200, "healthz");
  equal(JSON.stringify(await res.json()), '{"status":"ok"}', "healthz body");
  equal(res.headers.get("x-powered-by"), null, "x-powered-by header");
  equal(res.headers.get("x-content-type-options"), "nosniff", "nosniff header");
});

await finish();
