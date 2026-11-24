const prefix = "clarocuenta:" + self.registration.scope;
const cacheName = prefix + ":angular-8137258e3f82b556";
const shell = ["./","./apartados.8137258e3f82b556.js","./app.8137258e3f82b556.js","./appearance.8137258e3f82b556.js","./cards.8137258e3f82b556.js","./cloud-config.js","./cloud.8137258e3f82b556.js","./finance.8137258e3f82b556.js","./icon-192.png","./icon-512.png","./index.html","./main-4WVWBDPM.js","./manifest.webmanifest","./pwa.8137258e3f82b556.js","./reports.8137258e3f82b556.js","./styles-EYTCLBHE.css"];

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
