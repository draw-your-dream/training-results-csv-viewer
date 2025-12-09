const APP_SHELL_CACHE = "csv-viewer-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(APP_SHELL_CACHE);
        const indexRequest = new Request(new URL("index.html", self.registration.scope), { cache: "reload" });
        await cache.add(indexRequest);
      } catch (error) {
        console.warn("[SW] Failed to pre-cache index:", error);
      } finally {
        await self.skipWaiting();
      }
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => (key === APP_SHELL_CACHE ? Promise.resolve() : caches.delete(key))));
    })()
  );
});

function isNavigationRequest(request) {
  if (request.mode === "navigate") {
    return true;
  }
  const acceptHeader = request.headers.get("accept") || "";
  return acceptHeader.includes("text/html");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !isNavigationRequest(request)) {
    return;
  }

  const scopeUrl = new URL(self.registration.scope);
  const scopePath = scopeUrl.pathname.endsWith("/") ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
  const url = new URL(request.url);

  if (!url.pathname.startsWith(scopePath)) {
    return;
  }

  const indexUrl = new URL("index.html", self.registration.scope).href;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(indexUrl, { cache: "no-store" });
        if (response.ok) {
          return response;
        }
        throw new Error("Network response not ok");
      } catch (error) {
        const cached = await caches.match(indexUrl);
        if (cached) {
          return cached;
        }
        return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
      }
    })()
  );
});
