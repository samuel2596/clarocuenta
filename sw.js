const prefix = "clarocuenta:" + self.registration.scope;
const cacheName = prefix + ":angular-de5b54a19a4be840";
const shell = ["./","./apartados.de5b54a19a4be840.js","./app.de5b54a19a4be840.js","./appearance.de5b54a19a4be840.js","./cards.de5b54a19a4be840.js","./cloud-config.js","./cloud.de5b54a19a4be840.js","./finance.de5b54a19a4be840.js","./icon-192.png","./icon-512.png","./icon-shrek.png","./index.html","./main-7SIKYOMO.js","./manifest.webmanifest","./pwa.de5b54a19a4be840.js","./reports.de5b54a19a4be840.js","./styles-ZVTNUV2U.css"];

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
