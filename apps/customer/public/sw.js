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
        if (!isPublicStatic(new URL(request.url))) continue;
        const response = await source.match(request);
        if (response?.ok && response.type === 'basic') {
          await target.put(request, response);
        }
      }
      await caches.delete(key);
    }
    await prune(target);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode === 'navigate' ||
      request.headers.has('authorization')) return;
  const url = new URL(request.url);
  if (!isPublicStatic(url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const hashed = url.pathname.startsWith('/_next/static/');
    const cached = await cache.match(request);
    if (hashed && cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic' &&
          !response.headers.has('set-cookie') &&
          (!response.headers.has('cache-control') ||
           !/private|no-store/i.test(response.headers.get('cache-control') || ''))) {
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
