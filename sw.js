const prefix = "clarocuenta:" + self.registration.scope;
const cacheName = prefix + ":v18";
const shell = ["./", "./index.html", "./style.css?v=18", "./app.js?v=18", "./appearance.js?v=18", "./navigation.js?v=18", "./reports.js?v=18", "./pwa.js?v=18", "./cloud.js?v=18", "./manifest.webmanifest", "./icon-192.png?v=2", "./icon-512.png?v=2"];

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
  // Always read the project configuration from the deployment.
  if (new URL(event.request.url).pathname.endsWith("/cloud-config.js")) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.open(cacheName)
      .then((cache) => cache.match("./"))));
    return;
  }
  event.respondWith(caches.open(cacheName).then(async (cache) =>
    (await cache.match(event.request)) ?? fetch(event.request)));
});
