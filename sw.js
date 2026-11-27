const prefix = "clarocuenta:" + self.registration.scope;
const cacheName = prefix + ":angular-87b61b1672b9f6cc";
const shell = ["./","./apartados.87b61b1672b9f6cc.js","./app.87b61b1672b9f6cc.js","./appearance.87b61b1672b9f6cc.js","./cards.87b61b1672b9f6cc.js","./cloud-config.js","./cloud.87b61b1672b9f6cc.js","./finance.87b61b1672b9f6cc.js","./icon-192.png","./icon-512.png","./icon-shrek.png","./index.html","./main-LG5E5Q62.js","./manifest.webmanifest","./pwa.87b61b1672b9f6cc.js","./reports.87b61b1672b9f6cc.js","./styles-SDC7YH5F.css"];

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
