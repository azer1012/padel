/* Club service worker
 * - App shell works offline (navigation falls back to the cached index.html)
 * - Hashed build assets are cache-first; API calls are NEVER cached (live availability)
 * - Shows push notifications and opens the right page on tap
 */
// Changing this name drops every copy saved by the previous worker
const VERSION = "smash-v2";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./favicon.svg", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // fonts, Supabase, API on another host
  if (url.pathname.includes("/api/")) return; // never cache live data

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put("./index.html", copy)); return res; })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }

  const keep = (res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  };

  // Build assets carry a hash in their name: a new version is a new file, so the saved copy is always right
  if (url.pathname.includes("/assets/")) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(keep)));
    return;
  }

  // Club photos, logo and icons keep their name when the club replaces them: ask the
  // network first so a new photo shows at once; the saved copy is only for offline
  if (/\.(png|jpe?g|webp|svg|woff2?)$/.test(url.pathname)) {
    event.respondWith(fetch(req).then(keep).catch(() => caches.match(req)));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || "Padel";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "icon-192.png",
    badge: "icon-192.png",
    tag: data.tag,
    renotify: !!data.tag,
    data: { url: data.url || "./dashboard" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data && event.notification.data.url || "./dashboard", self.location.href).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === new URL(target).origin) { await w.focus(); return w.navigate(target); }
    }
    return self.clients.openWindow(target);
  })());
});
