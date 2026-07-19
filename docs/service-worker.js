const CACHE_NAME = "idea-seed-shell-v15";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./data-store.js",
  "./data-service.js",
  "./random.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./manifest.json",
  "./logline/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith(".json")) {
    event.respondWith(networkFirstJson(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("./index.html")));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
});

async function networkFirstJson(request) {
  const cache = await caches.open(CACHE_NAME);
  const normalized = new URL(request.url);
  normalized.search = "";
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(normalized.href, response.clone());
    return response;
  } catch {
    const cached = await cache.match(normalized.href);
    if (cached) return cached;
    throw new Error("オフラインデータがありません");
  }
}
