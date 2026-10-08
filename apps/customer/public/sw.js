/* VAYLET Guest: public-static only. The Browser Session is cookie-authorized. */
const PREFIX = 'vaylet-guest-public-static-';
const CACHE_NAME = `${PREFIX}r2`;
const LEGACY_CACHE = 'vaylet-static-v1';
const MAX_ASSETS = 240;
const PUBLIC_ASSETS = new Set([
  '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png',
  '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png',
]);
const READY_PUSH_COPY = Object.freeze({
  en: Object.freeze({
    title: 'Your vehicle is ready',
    body: 'Your vehicle has arrived at the pickup area.',
  }),
  ar: Object.freeze({
    title: 'سيارتك جاهزة',
    body: 'وصلت مركبتك إلى منطقة الاستلام وهي جاهزة لك.',
  }),
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPublicStatic(url) {
  if (url.origin !== self.location.origin || url.search || url.hash) return false;
  return PUBLIC_ASSETS.has(url.pathname) ||
    /^\/_next\/static\/[a-zA-Z0-9/_\-\.]+$/.test(url.pathname);
}

function mayCacheRequest(request) {
  return request.method === 'GET' && request.mode !== 'navigate' &&
    !request.headers.has('authorization') && isPublicStatic(new URL(request.url));
}

function mayCacheResponse(response) {
  return response?.ok && response.type === 'basic' &&
    !response.headers.has('set-cookie') &&
    !/private|no-store/i.test(response.headers.get('cache-control') || '');
}

async function prune(cache) {
  const requests = await cache.keys();
  const excess = Math.max(0, requests.length - MAX_ASSETS);
  await Promise.all(requests.slice(0, excess).map((request) => cache.delete(request)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const target = await caches.open(CACHE_NAME);
    // Older releases' hashed Next chunks remain useful for already-open pages.
    // Import ONLY approved public files from the former overly broad cache.
    const migrations = keys.filter((key) => key === LEGACY_CACHE ||
      (key.startsWith(PREFIX) && key !== CACHE_NAME));
    for (const key of migrations) {
      const source = await caches.open(key);
      for (const request of await source.keys()) {
        if (!mayCacheRequest(request)) continue;
        const response = await source.match(request);
        if (mayCacheResponse(response)) {
          await target.put(request, response);
        }
      }
      await caches.delete(key);
    }
    // Earlier SW versions could have migrated a public URL with private or
    // no-store headers; clean the current namespace as well as legacy imports.
    for (const request of await target.keys()) {
      const response = await target.match(request);
      if (!mayCacheRequest(request) || !mayCacheResponse(response)) {
        await target.delete(request);
      }
    }
    await prune(target);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!mayCacheRequest(request)) return;
  const url = new URL(request.url);

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const hashed = url.pathname.startsWith('/_next/static/');
    const cached = await cache.match(request);
    if (hashed && cached) return cached;
    try {
      const response = await fetch(request);
      if (mayCacheResponse(response)) {
        await cache.put(request, response.clone());
        await prune(cache);
      }
      return response;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  })());
});

function parseReadyPush(event) {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    return null;
  }
  if (!payload || payload.schemaVersion !== 1 ||
      payload.kind !== 'GUEST_VEHICLE_READY' ||
      payload.routeIntent !== 'GUEST_STATUS' ||
      !UUID.test(payload.intentId) ||
      (payload.locale !== 'en' && payload.locale !== 'ar')) return null;
  return payload;
}

self.addEventListener('push', (event) => {
  const payload = parseReadyPush(event);
  if (!payload) return;
  const copy = READY_PUSH_COPY[payload.locale];
  event.waitUntil(self.registration.showNotification(copy.title, {
    body: copy.body,
    data: { routeIntent: 'GUEST_STATUS' },
    tag: `guest-ready:${payload.intentId}`,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.notification.data?.routeIntent !== 'GUEST_STATUS') return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    const existing = windows.find((client) => {
      try {
        return new URL(client.url).origin === self.location.origin;
      } catch {
        return false;
      }
    });
    if (existing) {
      await existing.focus();
      return;
    }
    await self.clients.openWindow('/');
  })());
});
