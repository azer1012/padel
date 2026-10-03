/**
 * Photos uploaded by the desk: who may upload, what is accepted as a photo, how a
 * photo is served, the photos of a boutique article, and the removal of the photos
 * nothing shows any more. Supabase Storage is a local stand-in that answers the three
 * calls the API makes (upload, download, remove): nothing leaves the machine.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { client, createDatabase, dropDatabase, signup, startApi, type Api } from "./harness";

let api: Api;
let call: ReturnType<typeof client>;
type Member = { id: number; token: string };
let admin: Member, alice: Member;

const q = (sql: string, params: unknown[] = []) => api.pool.query(sql, params).then((r) => r.rows);

// ─── Stand-in for Supabase Storage ───────────────────────────────────────────
const stored = new Map<string, { body: Buffer; type: string }>();
const storage = { down: false, keys: [] as (string | undefined)[] };
let storageServer: http.Server;

function startStorage() {
  storageServer = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks);
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    storage.keys.push(req.headers.authorization);
    const m = new URL(req.url!, "http://x").pathname.match(
      /^\/storage\/v1\/object\/([\w-]+)(?:\/(.+))?$/,
    );
    if (!m) return send(404, { message: "not storage" });
    const [, bucket, name] = m;
    if (req.method === "POST" && name) {
      if (storage.down) return send(500, { statusCode: "500", message: "storage is down" });
      stored.set(`${bucket}/${name}`, { body: raw, type: String(req.headers["content-type"]) });
      return send(200, { Id: "id", Key: `${bucket}/${name}` });
    }
    if (req.method === "GET" && name) {
      const file = stored.get(`${bucket}/${name}`);
      if (!file) return send(404, { statusCode: "404", message: "Object not found" });
      res.writeHead(200, { "content-type": file.type });
      return res.end(file.body);
    }
    if (req.method === "DELETE" && !name) {
      const removed = [];
      for (const p of JSON.parse(raw.toString() || "{}").prefixes ?? [])
        if (stored.delete(`${bucket}/${p}`)) removed.push({ name: p });
      return send(200, removed);
    }
    return send(404, { message: "not implemented" });
  });
  return new Promise<string>((ok) =>
    storageServer.listen(0, "127.0.0.1", () =>
      ok(`http://127.0.0.1:${(storageServer.address() as AddressInfo).port}`),
    ),
  );
}

// ─── The smallest files that start like real photos ──────────────────────────
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(200, 7),
]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0xd0, 0, 0, 0]),
  Buffer.from("WEBP"),
  Buffer.alloc(200, 7),
]);

async function upload(body: Buffer | string, token?: string, type = "image/jpeg") {
  const res = await fetch(`${api.base}/admin/media`, {
    method: "POST",
    headers: { "content-type": type, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body,
  });
  return { status: res.status, body: (await res.json()) as any };
}

before(async () => {
  const storageUrl = await startStorage();
  await createDatabase();
  api = await startApi({ SUPABASE_URL: storageUrl });
  call = client(api.base);
  admin = await signup(api.pool, "owner@club.tn", { first_name: "Club", last_name: "Owner" });
  await q("update users set role = 'admin' where id = $1", [admin.id]);
  alice = await signup(api.pool, "alice@test.tn", { first_name: "Alice", last_name: "Ben Salah" });
});

after(async () => {
  await api?.close();
  await dropDatabase();
  await new Promise((r) => storageServer.close(r));
});

describe("uploading a photo", () => {
  test("only the desk uploads", async () => {
    const visitor = await upload(JPEG);
    assert.equal(visitor.status, 401);
    const player = await upload(JPEG, alice.token);
    assert.equal(player.status, 403);
    assert.equal(player.body.code, "FORBIDDEN");
    assert.equal(stored.size, 0, "nothing reached the storage");
    assert.deepEqual(await q("select * from media_files"), []);
  });

  test("a JPEG, a PNG and a WebP are kept, in the private bucket, under a name nobody can guess", async () => {
    for (const [file, ext, type] of [
      [JPEG, "jpg", "image/jpeg"],
      [PNG, "png", "image/png"],
      [WEBP, "webp", "image/webp"],
    ] as const) {
      const up = await upload(file, admin.token);
      assert.equal(up.status, 201, JSON.stringify(up.body));
      assert.match(up.body.key, new RegExp(`^[a-f0-9]{32}\\.${ext}$`));
      assert.equal(up.body.url, `/api/media/${up.body.key}`);
      assert.equal(up.body.contentType, type);
      assert.equal(up.body.bytes, file.length);
      const kept = stored.get(`media/${up.body.key}`);
      assert.ok(kept, "the file is in the media bucket");
      assert.ok(kept.body.equals(file), "the bytes are the ones sent");
      const [row] = await q(
        "select content_type, bytes, uploaded_by from media_files where key = $1",
        [up.body.key],
      );
      assert.deepEqual(row, { content_type: type, bytes: file.length, uploaded_by: admin.id });
    }
    // The storage is called with the API's own key, never with the member's session
    assert.ok(storage.keys.every((k) => k === "Bearer test-service-role"));
  });

  test("what the file is comes from its bytes, not from what the request says", async () => {
    // A PNG announced as a JPEG is stored as the PNG it is
    const png = await upload(PNG, admin.token, "image/jpeg");
    assert.equal(png.status, 201);
    assert.equal(png.body.contentType, "image/png");
    assert.match(png.body.key, /\.png$/);

    const before = stored.size;
    for (const [what, body, type] of [
      [
        "an SVG with a script",
        `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`,
        "image/svg+xml",
      ],
      ["a web page announced as a JPEG", "<html><script>alert(1)</script></html>", "image/jpeg"],
      ["a GIF", Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(50)]), "image/gif"],
      ["a JSON body", JSON.stringify({ url: "https://evil.example/x.jpg" }), "application/json"],
      ["an empty body", Buffer.alloc(0), "image/jpeg"],
    ] as const) {
      const bad = await upload(body, admin.token, type);
      assert.equal(bad.status, 400, what);
      assert.equal(bad.body.code, "UNSUPPORTED_IMAGE", what);
    }
    assert.equal(stored.size, before, "a refused file never reaches the storage");
  });

  test("a file over 5 MB is refused", async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await upload(big, admin.token);
    assert.equal(res.status, 413);
    assert.equal(res.body.code, "TOO_LARGE");
    // Just under the limit goes through
    const ok = await upload(
      Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024 - JPEG.length)]),
      admin.token,
    );
    assert.equal(ok.status, 201);
  });

  test("the storage not answering: the desk is told, and nothing is recorded", async () => {
    const rows = (await q("select count(*)::int as n from media_files"))[0].n;
    storage.down = true;
    const res = await upload(JPEG, admin.token);
    storage.down = false;
    assert.equal(res.status, 502);
    assert.equal(res.body.code, "STORAGE_ERROR");
    assert.equal((await q("select count(*)::int as n from media_files"))[0].n, rows);
  });
});

describe("showing a photo", () => {
  test("anybody sees an uploaded photo, as the picture it is, kept by browsers", async () => {
    const up = await upload(WEBP, admin.token);
    const res = await fetch(`${api.base}/media/${up.body.key}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/webp");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.ok(Buffer.from(await res.arrayBuffer()).equals(WEBP));
  });

  test("a name that is not a photo's never reaches the storage", async () => {
    const calls = storage.keys.length;
    for (const key of [
      "nothing.jpg",
      "0123456789abcdef0123456789abcdef.svg",
      "0123456789abcdef0123456789abcdef.jpg.html",
      "..%2F..%2Fsecret",
      "%2e%2e%2favatars%2fx.jpg",
    ]) {
      const res = await call("GET", `/media/${key}`);
      assert.equal(res.status, 404, key);
      assert.equal(res.body.code, "NOT_FOUND", key);
    }
    assert.equal(storage.keys.length, calls, "the storage was asked");
    // A well-formed name with no file behind it
    const gone = await call("GET", "/media/0123456789abcdef0123456789abcdef.jpg");
    assert.equal(gone.status, 404);
  });
});

describe("the photos of a boutique article", () => {
  let article: number;

  test("several photos, in the order given; the first one is the cover", async () => {
    const a = (await upload(JPEG, admin.token)).body.url;
    const b = (await upload(PNG, admin.token)).body.url;
    const created = await call("POST", "/admin/shop/products", {
      token: admin.token,
      body: {
        name: "Raquette Carbone Pro",
        price: 349,
        stock: 2,
        // The same photo twice is one photo; an empty line is nothing
        imageUrls: [a, b, a, "", "https://cdn.example/face.jpg"],
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    article = created.body.id;
    assert.deepEqual(created.body.imageUrls, [a, b, "https://cdn.example/face.jpg"]);
    const [shown] = (await call("GET", "/shop/products")).body;
    assert.deepEqual(shown.imageUrls, [a, b, "https://cdn.example/face.jpg"]);
    assert.equal("imageUrl" in shown, false);

    // Another photo put first; then all of them removed
    const reordered = await call("PATCH", `/admin/shop/products/${article}`, {
      token: admin.token,
      body: { imageUrls: [b, a] },
    });
    assert.deepEqual(reordered.body.imageUrls, [b, a]);
    const none = await call("PATCH", `/admin/shop/products/${article}`, {
      token: admin.token,
      body: { imageUrls: [] },
    });
    assert.deepEqual(none.body.imageUrls, []);
    // A change of price leaves the photos alone
    await call("PATCH", `/admin/shop/products/${article}`, {
      token: admin.token,
      body: { imageUrls: [a] },
    });
    const priced = await call("PATCH", `/admin/shop/products/${article}`, {
      token: admin.token,
      body: { price: 359 },
    });
    assert.deepEqual(priced.body.imageUrls, [a]);
  });

  test("six photos at most, each an https link or a file of the site", async () => {
    const seven = Array.from({ length: 7 }, (_, i) => `https://cdn.example/${i}.jpg`);
    const many = await call("PATCH", `/admin/shop/products/${article}`, {
      token: admin.token,
      body: { imageUrls: seven },
    });
    assert.equal(many.status, 400);
    assert.equal(many.body.code, "TOO_MANY_PHOTOS");
    const six = await call("PATCH", `/admin/shop/products/${article}`, {
      token: admin.token,
      body: { imageUrls: seven.slice(0, 6) },
    });
    assert.equal(six.status, 200);
    for (const bad of [
      ["http://cdn.example/a.jpg"],
      ["javascript:alert(1)"],
      ["//evil.example/a.jpg"],
      "x",
    ]) {
      const res = await call("PATCH", `/admin/shop/products/${article}`, {
        token: admin.token,
        body: { imageUrls: bad },
      });
      assert.equal(res.status, 400, JSON.stringify(bad));
      assert.equal(res.body.code, "VALIDATION_ERROR");
    }
    // The database holds the same limit, whatever writes to it
    await assert.rejects(
      q("update shop_products set image_urls = $1 where id = $2", [seven, article]),
      /shop_products_image_urls_check/,
    );
  });
});

describe("photos nothing shows any more", () => {
  test("after a day they leave the storage; the ones in use and the recent ones stay", async () => {
    const { sweepMedia } = await import("../src/lib/media");
    await q("delete from shop_products");
    await q("delete from media_files");
    stored.clear();

    const up = async () => (await upload(JPEG, admin.token)).body as { key: string; url: string };
    const [onNews, onTournament, onArticle, onCourt, unused, fresh] = [
      await up(),
      await up(),
      await up(),
      await up(),
      await up(),
      await up(),
    ];
    const post = (path: string, body: unknown) => call("POST", path, { token: admin.token, body });
    assert.equal(
      (await post("/news", { title: "Tournoi d'été", content: "…", imageUrl: onNews.url })).status,
      201,
    );
    const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString();
    assert.equal(
      (
        await post("/tournaments", {
          name: "Open d'été",
          startDate: day(10),
          endDate: day(11),
          imageUrl: onTournament.url,
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await post("/admin/shop/products", {
          name: "Sac",
          price: 90,
          imageUrls: ["https://cdn.example/a.jpg", onArticle.url],
        })
      ).status,
      201,
    );
    assert.equal(
      (await post("/terrains", { name: "Court A", type: "indoor", photos: [onCourt.url] })).status,
      201,
    );
    // Everything was uploaded two days ago, except the last one
    await q("update media_files set created_at = now() - interval '2 days' where key <> $1", [
      fresh.key,
    ]);

    assert.equal(await sweepMedia(), 1);
    const left = (await q("select key from media_files order by id")).map((r) => r.key);
    assert.deepEqual(
      left,
      [onNews, onTournament, onArticle, onCourt, fresh].map((p) => p.key),
    );
    assert.equal(stored.has(`media/${unused.key}`), false, "the unused file is still stored");
    assert.equal((await call("GET", `/media/${unused.key}`)).status, 404);
    for (const p of [onNews, onTournament, onArticle, onCourt, fresh])
      assert.equal((await fetch(`${api.base}/media/${p.key}`)).status, 200, p.key);

    // A photo taken off its page leaves at the next run; running again changes nothing
    await q("update news set image_url = null");
    assert.equal(await sweepMedia(), 1);
    assert.equal(await sweepMedia(), 0);
    assert.equal(stored.has(`media/${onNews.key}`), false);
  });
});
