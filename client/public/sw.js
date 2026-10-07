const SHELL_CACHE = "sadiq-wms-shell-v2";
const RUNTIME_CACHE = "sadiq-wms-runtime-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(["/"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(keys.filter((key) => ![SHELL_CACHE, RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key)))),
      self.clients.claim(),
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put("/", copy)));
          }
          return response;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy)));
          }
          return response;
        });
      })
    );
  }
});
