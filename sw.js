const prefix = "clarocuenta:" + self.registration.scope;
const cacheName = prefix + ":angular-6a32d3c40eb5cf76";
const shell = ["./","./apartados.6a32d3c40eb5cf76.js","./app.6a32d3c40eb5cf76.js","./appearance.6a32d3c40eb5cf76.js","./cards.6a32d3c40eb5cf76.js","./cloud-config.js","./cloud.6a32d3c40eb5cf76.js","./finance.6a32d3c40eb5cf76.js","./icon-192.png","./icon-512.png","./index.html","./main-KJUOBU5V.js","./manifest.webmanifest","./pwa.6a32d3c40eb5cf76.js","./reports.6a32d3c40eb5cf76.js","./styles-EYTCLBHE.css"];

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
