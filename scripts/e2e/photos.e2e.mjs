/**
 * Photos picked by the desk instead of pasted links: a boutique article with several
 * photos (the member swipes through them), an article of the news, a tournament and a
 * court. A photo is made lighter in the browser before it is sent, a file that is not
 * a picture is refused, and a storage that does not answer is said plainly.
 * Supabase Storage is the stand-in of auth-stub.mjs: nothing leaves the machine.
 */
import zlib from "node:zlib";
import {
  AUTH,
  USERS,
  WEB,
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
const { admin: ADMIN } = USERS;

/** A real PNG of one colour, as a phone or a camera would give (only much smaller). */
function png(width, height, [r, g, b]) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB
  const line = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) line.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => line));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", head),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const file = (name, size, colour) => ({
  name,
  mimeType: "image/png",
  buffer: png(size[0], size[1], colour),
});
const BLUE = file("raquette-face.png", [3000, 2000], [46, 76, 246]);
const LIME = file("raquette-dos.png", [800, 1200], [221, 247, 74]);
const NIGHT = file("court.png", [1200, 800], [10, 16, 48]);

const storage = async () => (await fetch(`${AUTH}/__test/storage`)).json();
const storageDown = (down) =>
  fetch(`${AUTH}/__test/storage`, { method: "POST", body: JSON.stringify({ down }) });
/** Width and height of a picture as the browser draws it, once it has loaded. */
const drawn = (locator) =>
  locator.evaluate(
    (img) =>
      new Promise((done) => {
        const size = () => done([img.naturalWidth, img.naturalHeight]);
        if (img.complete) size();
        else {
          img.addEventListener("load", size, { once: true });
          img.addEventListener("error", () => done([0, 0]), { once: true });
        }
      }),
  );
const UPLOADED = /^\/api\/media\/[a-f0-9]{32}\.(webp|jpg)$/;

const desk = await as(ADMIN);

// ════════════════════════════════════════════════════════════════════════════
section("A boutique article with several photos");
let article;

await step(
  "the desk picks two photos at once: they are sent and shown, the first one as cover",
  async () => {
    await desk.page.goto(`${WEB}/admin/shop`);
    await desk.page.getByTestId("btn-create-product").click();
    const dialog = desk.page.getByRole("dialog");
    await dialog.locator("#sp-name").fill("Raquette Carbone Pro");
    await dialog.locator("#sp-price").fill("349");
    await dialog.getByTestId("product-photos-file").setInputFiles([BLUE, LIME]);
    await dialog.getByTestId("product-photos-item-1").waitFor({ timeout: 20000 });
    await dialog.getByTestId("product-photos-item-0").getByText("Principale").waitFor();
    equal((await storage()).files.length, 2, "files in the storage");
    await shot(desk.page, "photos-01-article-form");
  },
);

await step("a big photo was made lighter before leaving the browser", async () => {
  const dialog = desk.page.getByRole("dialog");
  const [w, h] = await drawn(dialog.getByTestId("product-photos-item-0").locator("img"));
  // 3000 × 2000 becomes 1600 on its long side, same proportions
  equal(`${w}x${h}`, "1600x1067", "size of the stored photo");
  const [w2, h2] = await drawn(dialog.getByTestId("product-photos-item-1").locator("img"));
  equal(`${w2}x${h2}`, "800x1200", "a photo already small keeps its size");
  const rows = await sql("select content_type, bytes from media_files order by id");
  equal(rows.length, 2, "photos recorded");
  assert(
    rows.every((r) => r.content_type === "image/webp"),
    `sent as ${rows.map((r) => r.content_type)}`,
  );
  assert(rows[0].bytes < BLUE.buffer.length, "the photo was not made lighter");
});

await step(
  "the second photo becomes the cover; saved, the article keeps both in that order",
  async () => {
    const dialog = desk.page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Mettre la photo 2 en premier" }).click();
    const [w] = await drawn(dialog.getByTestId("product-photos-item-0").locator("img"));
    equal(w, 800, "the cover is now the second photo");
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await desk.page.getByText("Article ajouté").first().waitFor({ timeout: 10000 });
    const [p] = await sql("select id, image_urls from shop_products");
    article = p.id;
    equal(p.image_urls.length, 2, "photos of the article");
    assert(
      p.image_urls.every((u) => UPLOADED.test(u)),
      `addresses: ${p.image_urls}`,
    );
    await desk.page.getByText("2 photos").waitFor();
  },
);

await step("a member sees the cover, and moves to the next photo", async () => {
  const v = await as(null);
  await v.page.goto(`${WEB}/boutique`);
  const gallery = v.page.getByTestId(`product-photos-${article}`);
  const strip = gallery.getByRole("region", { name: /Photos de Raquette Carbone Pro : 1 sur 2/ });
  await strip.waitFor({ timeout: 15000 });
  const [w] = await drawn(gallery.locator("img").first());
  equal(w, 800, "the cover is the photo the desk put first");
  await gallery.getByRole("button", { name: "Photo suivante" }).click();
  await gallery.getByRole("region", { name: /2 sur 2/ }).waitFor({ timeout: 5000 });
  // With the keyboard too
  await gallery.getByRole("region").focus();
  await v.page.keyboard.press("ArrowLeft");
  await gallery.getByRole("region", { name: /1 sur 2/ }).waitFor({ timeout: 5000 });
  // The strip has stopped moving
  await v.page.waitForTimeout(700);
  await shot(v.page, "photos-02-boutique");
  await gallery.getByRole("button", { name: "Photo suivante" }).click();
  await gallery.getByRole("region", { name: /2 sur 2/ }).waitFor({ timeout: 5000 });
  await v.page.waitForTimeout(700);
  await shot(v.page, "photos-02b-boutique-second");
  equal(v.page.problems.length, 0, v.page.problems.slice(0, 3).join(" · "));
  await v.ctx.close();
});

await step("a file that is not a picture is refused, and nothing is sent", async () => {
  await desk.page.getByRole("button", { name: "Modifier Raquette Carbone Pro" }).click();
  const dialog = desk.page.getByRole("dialog");
  await dialog.getByTestId("product-photos-item-1").waitFor();
  await dialog.getByTestId("product-photos-file").setInputFiles({
    name: "facture.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("this is not a photo"),
  });
  await dialog
    .getByTestId("product-photos-error")
    .getByText(/n'est pas une photo lisible/)
    .waitFor({ timeout: 10000 });
  equal((await storage()).files.length, 2, "files in the storage");
  equal(await dialog.locator('[data-testid^="product-photos-item-"]').count(), 2, "photos kept");
});

await step("the storage not answering is said plainly; the form keeps what it had", async () => {
  const dialog = desk.page.getByRole("dialog");
  await storageDown(true);
  await dialog.getByTestId("product-photos-file").setInputFiles(NIGHT);
  await dialog
    .getByTestId("product-photos-error")
    .getByText(/n'a pas pu être enregistrée/)
    .waitFor({ timeout: 10000 });
  await storageDown(false);
  equal(await dialog.locator('[data-testid^="product-photos-item-"]').count(), 2, "photos kept");
  // The failure was told to the desk: it is not a problem of the page
  desk.page.problems.length = 0;
});

await step("a photo is removed, a link is added beside the uploaded one", async () => {
  const dialog = desk.page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Retirer la photo 2" }).click();
  await dialog.getByTestId("product-photos-link-toggle").click();
  await dialog.getByTestId("product-photos-link").fill("http://exemple.tn/a.jpg");
  await dialog.getByTestId("product-photos-link-add").click();
  await dialog
    .getByTestId("product-photos-error")
    .getByText(/commencer par https/)
    .waitFor();
  await dialog.getByTestId("product-photos-link").fill("/club-detail-960.webp");
  await dialog.getByTestId("product-photos-link-add").click();
  await dialog.getByTestId("product-photos-item-1").waitFor();
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await desk.page.getByText("Article mis à jour").first().waitFor({ timeout: 10000 });
  const [p] = await sql("select image_urls from shop_products where id = $1", [article]);
  equal(p.image_urls.length, 2, "photos of the article");
  assert(UPLOADED.test(p.image_urls[0]), `first photo: ${p.image_urls[0]}`);
  equal(p.image_urls[1], "/club-detail-960.webp", "second photo");
});

// ════════════════════════════════════════════════════════════════════════════
section("One photo: news, tournaments, courts");

await step("an article of the news gets its photo from a file, and visitors see it", async () => {
  await desk.page.goto(`${WEB}/admin/news`);
  await desk.page.getByTestId("btn-create-article").click();
  const dialog = desk.page.getByRole("dialog");
  await dialog.getByTestId("input-article-title").fill("Nouveau terrain couvert");
  await dialog.getByTestId("input-article-content").fill("Ouverture samedi.");
  await dialog.getByTestId("news-photo-file").setInputFiles(NIGHT);
  await dialog.getByTestId("news-photo-item-0").waitFor({ timeout: 20000 });
  // One photo: the button now offers to change it
  await dialog.getByTestId("news-photo-add").getByText("Changer la photo").waitFor();
  await dialog.getByRole("switch").click();
  await dialog.getByTestId("btn-save-article").click();
  await dialog.waitFor({ state: "hidden", timeout: 10000 });
  const [n] = await sql("select image_url from news");
  assert(UPLOADED.test(n.image_url), `news photo: ${n.image_url}`);

  const v = await as(null);
  await v.page.goto(`${WEB}/news`);
  const card = v.page.getByRole("button", { name: /Nouveau terrain couvert/ });
  await card.waitFor({ timeout: 15000 });
  const [w, h] = await drawn(card.locator("img"));
  equal(`${w}x${h}`, "1200x800", "photo of the article");
  equal(v.page.problems.length, 0, v.page.problems.slice(0, 3).join(" · "));
  await v.ctx.close();
});

await step(
  "picking another photo replaces the first; removing it empties the article",
  async () => {
    await desk.page
      .getByRole("button", { name: /Modifier/ })
      .first()
      .click();
    const dialog = desk.page.getByRole("dialog");
    await dialog.getByTestId("news-photo-item-0").waitFor();
    await dialog.getByTestId("news-photo-file").setInputFiles(LIME);
    await desk.page.waitForFunction(
      () =>
        document.querySelector('[data-testid="news-photo-item-0"] img')?.naturalWidth === 800 &&
        !document.querySelector('[data-testid="news-photo-item-1"]'),
      null,
      { timeout: 20000 },
    );
    await dialog.getByRole("button", { name: "Retirer la photo" }).click();
    equal(await dialog.locator('[data-testid^="news-photo-item-"]').count(), 0, "photos");
    await dialog.getByTestId("btn-save-article").click();
    await dialog.waitFor({ state: "hidden", timeout: 10000 });
    for (let i = 0; i < 50; i++) {
      if ((await sql("select image_url from news"))[0].image_url === null) break;
      await desk.page.waitForTimeout(100);
    }
    equal((await sql("select image_url from news"))[0].image_url, null, "photo of the article");
  },
);

await step("a tournament and a court get their photo the same way", async () => {
  await desk.page.goto(`${WEB}/admin/tournaments`);
  await desk.page.getByTestId("btn-create-tournament").click();
  let dialog = desk.page.getByRole("dialog");
  await dialog.getByTestId("input-tournament-name").fill("Open d'été");
  await dialog.locator("#tr-start").fill("2030-07-12T09:00");
  await dialog.getByTestId("tournament-photo-file").setInputFiles(NIGHT);
  await dialog.getByTestId("tournament-photo-item-0").waitFor({ timeout: 20000 });
  await dialog.getByTestId("btn-save-tournament").click();
  await dialog.waitFor({ state: "hidden", timeout: 10000 });
  const [t] = await sql("select image_url from tournaments where name = $1", ["Open d'été"]);
  assert(UPLOADED.test(t?.image_url ?? ""), `tournament photo: ${t?.image_url}`);

  await desk.page.goto(`${WEB}/admin/terrains`);
  await desk.page.getByTestId("btn-create-terrain").click();
  dialog = desk.page.getByRole("dialog");
  await dialog.getByTestId("input-terrain-name").fill("Court Panorama");
  await dialog.getByTestId("court-photo-file").setInputFiles(BLUE);
  await dialog.getByTestId("court-photo-item-0").waitFor({ timeout: 20000 });
  await dialog.getByTestId("btn-save-terrain").click();
  await dialog.waitFor({ state: "hidden", timeout: 10000 });
  const [c] = await sql("select photos from terrains where name = $1", ["Court Panorama"]);
  assert(UPLOADED.test(c?.photos?.[0] ?? ""), `court photo: ${c?.photos}`);
});

// ════════════════════════════════════════════════════════════════════════════
section("Nothing left behind, on a phone too");

await step(
  "on a phone: the article form with its photos fits, and so does the boutique",
  async () => {
    const m = await as(ADMIN, { width: 375, height: 800 });
    await m.page.goto(`${WEB}/admin/shop`);
    await m.page.getByRole("button", { name: "Modifier Raquette Carbone Pro" }).click();
    const dialog = m.page.getByRole("dialog");
    await dialog.getByTestId("product-photos-item-1").waitFor({ timeout: 15000 });
    equal(await overflow(m.page), 0, "sideways scroll of the form");
    await m.page.waitForTimeout(700);
    await shot(m.page, "photos-03-form-mobile");
    await m.page.goto(`${WEB}/boutique`);
    await m.page.getByTestId(`product-photos-${article}`).waitFor({ timeout: 15000 });
    equal(await overflow(m.page), 0, "sideways scroll of the boutique");
    await shot(m.page, "photos-04-boutique-mobile");
    equal(m.page.problems.length, 0, m.page.problems.slice(0, 3).join(" · "));
    await m.ctx.close();
  },
);

await step(
  "every photo sent is recorded, only the desk may send one, and no page broke",
  async () => {
    const files = (await storage()).files;
    const rows = await sql("select key from media_files order by key");
    equal(
      files.join(),
      rows.map((r) => `media/${r.key}`).join(),
      "the storage and the database hold the same photos",
    );
    const member = await as(USERS.yasmine);
    await member.page.goto(`${WEB}/boutique`);
    await member.page.getByTestId(`product-photos-${article}`).waitFor({ timeout: 15000 });
    const refused = await member.page.evaluate(async () => {
      const session = JSON.parse(localStorage.getItem("padel-club-auth"));
      const res = await fetch("/api/admin/media", {
        method: "POST",
        headers: { authorization: `Bearer ${session.access_token}`, "content-type": "image/png" },
        body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      });
      return res.status;
    });
    equal(refused, 403, "a member's upload");
    await member.ctx.close();
    equal(desk.page.problems.length, 0, desk.page.problems.slice(0, 4).join(" · "));
  },
);

await finish();
