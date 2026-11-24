const prefix = "clarocuenta:" + self.registration.scope;
const cacheName = prefix + ":angular-c0d6bb3b74a3dff5";
const shell = ["./","./apartados.c0d6bb3b74a3dff5.js","./app.c0d6bb3b74a3dff5.js","./appearance.c0d6bb3b74a3dff5.js","./cards.c0d6bb3b74a3dff5.js","./cloud-config.js","./cloud.c0d6bb3b74a3dff5.js","./finance.c0d6bb3b74a3dff5.js","./icon-192.png","./icon-512.png","./index.html","./main-4TIHMQGC.js","./manifest.webmanifest","./pwa.c0d6bb3b74a3dff5.js","./reports.c0d6bb3b74a3dff5.js","./styles-JGBWRC3V.css"];

self.addEventListener("install", (event) => {
  const requests = shell.map((path) => new Request(new URL(path, self.registration.scope), { cache: "reload" }));
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(requests))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith(prefix) && key !== cacheName)
    .map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith(self.registration.scope)) return;
  if (new URL(event.request.url).pathname.endsWith("/cloud-config.js")) {
    event.respondWith(fetch(event.request).catch(() => caches.open(cacheName)
      .then((cache) => cache.match("./cloud-config.js"))));
    return;
  }
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.open(cacheName)
      .then((cache) => cache.match("./"))));
    return;
  }
  event.respondWith(caches.open(cacheName).then(async (cache) =>
    (await cache.match(event.request)) ?? fetch(event.request)));
});
