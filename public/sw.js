/**
 * Coditu's service worker. It does two things and deliberately nothing else.
 *
 * ── There is no caching in here, on purpose ────────────────────────────────
 * This application is dynamic and server-rendered: a sprint board with realtime
 * subscriptions, where the reason the footer total is trusted is that it is
 * never out of date. A cached shell would serve somebody yesterday's sprint and
 * they would have no way to tell. A stale cached app is a worse bug than a slow
 * one, and offline support is a separate request with its own ADR.
 *
 * ── Every push MUST show a notification ────────────────────────────────────
 * iOS revokes a push subscription that receives a push and shows nothing. Not
 * "may" — it counts the silent ones and takes the permission away. So there is
 * no early return in the `push` handler below: a payload that fails to parse
 * still ends in `showNotification`, with a sentence that at least says who it
 * is from.
 *
 * Served from the origin root so its scope covers the whole site, which is what
 * lets a notification click focus a tab already open on `/app`.
 */

const FALLBACK = {
  title: "Coditu",
  body: "You were mentioned.",
  url: "/app/my-work",
};

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for every tab to close. There is
  // no cache to migrate, so there is nothing a new version can break.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = FALLBACK;

  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data === "object") {
      payload = {
        title: typeof data.title === "string" && data.title ? data.title : FALLBACK.title,
        body: typeof data.body === "string" && data.body ? data.body : FALLBACK.body,
        url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : FALLBACK.url,
      };
    }
  } catch {
    // A malformed payload is still a push, and a push that shows nothing costs
    // the subscription. Fall through with FALLBACK.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Collapses repeated mentions on the same item into one notification
      // rather than a stack of them on the lock screen.
      tag: payload.url,
      renotify: true,
      data: { url: payload.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url ? event.notification.data.url : FALLBACK.url;

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      // Focus a window that is already open rather than opening a second copy
      // of the app — on a phone that would mean two entries in the switcher and
      // a lost scroll position in the first.
      for (const client of all) {
        if (!("focus" in client)) continue;
        await client.focus();
        if ("navigate" in client) {
          try {
            await client.navigate(target);
          } catch {
            // Cross-origin or a client that refuses; the focus already
            // happened, which is the important half.
          }
        }
        return;
      }

      if (self.clients.openWindow) await self.clients.openWindow(target);
    })()
  );
});
