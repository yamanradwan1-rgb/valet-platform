/* VAYLET Guest: public-static only. The Browser Session is cookie-authorized. */
const PREFIX = 'vaylet-guest-public-static-';
const CACHE_NAME = `${PREFIX}r2`;
const LEGACY_CACHE = 'vaylet-static-v1';
const MAX_ASSETS = 240;
const PUBLIC_ASSETS = new Set([
  '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png',
  '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png',
]);

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
