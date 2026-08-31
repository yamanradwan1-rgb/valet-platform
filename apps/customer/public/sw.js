const CACHE_PREFIX = "vaylet-static-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const CUSTOMER_CLICK = "VAYLET_CUSTOMER_NOTIFICATION_CLICK";
const GUEST_IDENTITY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/i;
const PAYLOAD_KEYS = [
  "audience",
  "body",
  "direction",
  "identity",
  "locale",
  "presentationType",
  "route",
  "title",
  "version",
];
const AUTH_RESULT_KEYS = ["authorized", "type"];
const CLICK_KEYS = ["identity", "route"];

function hasExactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return (
    keys.length === expected.length &&
    expected.every((key, index) => keys[index] === key)
  );
}

function isGuestPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  if (keys.length !== PAYLOAD_KEYS.length) return false;
  if (!PAYLOAD_KEYS.every((key, index) => keys[index] === key)) return false;
  return (
    value.version === 1 &&
    value.audience === "GUEST" &&
    value.presentationType === "GUEST_VEHICLE_READY" &&
    value.route === "GUEST_HOME" &&
    GUEST_IDENTITY_PATTERN.test(value.identity) &&
    (value.locale === "en" || value.locale === "ar") &&
    ((value.locale === "en" && value.direction === "ltr") ||
      (value.locale === "ar" && value.direction === "rtl")) &&
    typeof value.title === "string" &&
    value.title.length > 0 &&
    value.title.length <= 80 &&
    typeof value.body === "string" &&
    value.body.length > 0 &&
    value.body.length <= 160
  );
}

function clickMessage(data) {
  if (
    !hasExactKeys(data, CLICK_KEYS) ||
    data.route !== "GUEST_HOME" ||
    typeof data.identity !== "string" ||
    !GUEST_IDENTITY_PATTERN.test(data.identity)
  ) {
    return null;
  }
  return { identity: data.identity, route: "GUEST_HOME", type: CUSTOMER_CLICK };
}

function isSameOriginClient(client) {
  try {
    return new URL(client.url).origin === self.location.origin;
  } catch {
    return false;
  }
}

function clientHasGuestAccess(client, identity) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), 250);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(
        Boolean(
          hasExactKeys(event.data, AUTH_RESULT_KEYS) &&
          event.data.type === "VAYLET_CUSTOMER_AUTH_RESULT" &&
          event.data.authorized === true,
        ),
      );
    };
    client.postMessage({ identity, type: "VAYLET_CUSTOMER_AUTH_PROBE" }, [
      channel.port2,
    ]);
  });
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API or guest backend endpoints
  if (url.pathname.startsWith("/v1/") || url.pathname.startsWith("/api/"))
    return;

  // Never cache requests with Authorization header
  if (request.headers.has("authorization")) return;

  // Only cache safe static assets (_next/static, icons, manifest, static media)
  const isSafeStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".woff2");

  if (!isSafeStatic) return;

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    }),
  );
});

self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data && event.data.json();
  } catch {
    return;
  }
  if (!isGuestPayload(payload)) return;
  const message = {
    identity: payload.identity,
    route: "GUEST_HOME",
    type: "VAYLET_CUSTOMER_PUSH_OBSERVED",
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, {
        body: payload.body,
        data: { identity: payload.identity, route: "GUEST_HOME" },
        dir: payload.direction,
        lang: payload.locale,
        tag: payload.identity,
      }),
      self.clients
        .matchAll({ includeUncontrolled: true, type: "window" })
        .then((windows) => {
          for (const client of windows.filter(isSameOriginClient))
            client.postMessage(message);
        }),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  const message = clickMessage(event.notification && event.notification.data);
  event.notification.close();
  if (!message) return;

  event.waitUntil(
    self.clients
      .matchAll({ includeUncontrolled: true, type: "window" })
      .then(async (windows) => {
        const candidates = windows.filter(isSameOriginClient);
        const authorization = await Promise.all(
          candidates.map((client) =>
            clientHasGuestAccess(client, message.identity),
          ),
        );
        const client = candidates.find((_, index) => authorization[index]);
        if (client) {
          await client.focus();
          client.postMessage(message);
          return;
        }
        await self.clients.openWindow("/re-entry");
      }),
  );
});
