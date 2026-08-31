/* Employee Web Push only. This worker intentionally has no fetch/cache path. */
const EMPLOYEE_MESSAGE = "VAYLET_EMPLOYEE_NOTIFICATION_CLICK";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

function isEmployeePayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  if (keys.length !== PAYLOAD_KEYS.length) return false;
  if (!PAYLOAD_KEYS.every((key, index) => keys[index] === key)) return false;
  return (
    value.version === 1 &&
    value.audience === "EMPLOYEE" &&
    value.presentationType === "EMPLOYEE_RETRIEVAL_REQUESTED" &&
    value.route === "TASKS" &&
    UUID_PATTERN.test(value.identity) &&
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
  if (!data || data.route !== "TASKS" || !UUID_PATTERN.test(data.identity)) {
    return null;
  }
  return { identity: data.identity, route: "TASKS", type: EMPLOYEE_MESSAGE };
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data && event.data.json();
  } catch {
    return;
  }
  if (!isEmployeePayload(payload)) return;
  const observed = {
    identity: payload.identity,
    route: "TASKS",
    type: "VAYLET_EMPLOYEE_PUSH_OBSERVED",
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, {
        body: payload.body,
        data: { identity: payload.identity, route: "TASKS" },
        dir: payload.direction,
        lang: payload.locale,
        tag: payload.identity,
      }),
      self.clients
        .matchAll({ includeUncontrolled: true, type: "window" })
        .then((windows) => {
          for (const client of windows) {
            try {
              if (new URL(client.url).origin === self.location.origin) {
                client.postMessage(observed);
              }
            } catch {
              // Ignore malformed client URLs.
            }
          }
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
        const client = windows.find((candidate) => {
          try {
            return new URL(candidate.url).origin === self.location.origin;
          } catch {
            return false;
          }
        });
        if (client) {
          await client.focus();
          client.postMessage(message);
          return;
        }
        const opened = await self.clients.openWindow("/");
        opened && opened.postMessage(message);
      }),
  );
});
