import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const sw = readFileSync(new URL('../../../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://guest.example.test';

function browserResponse(content: string, headers?: HeadersInit): Response {
  const response = new Response(content, headers ? { status: 200, headers } : { status: 200 });
  Object.defineProperty(response, 'type', { value: 'basic' });
  return response;
}

function basicClone(response: Response): Response {
  const copy = response.clone();
  Object.defineProperty(copy, 'type', { value: 'basic' });
  return copy;
}

function fakeCache() {
  const entries = new Map<string, Response>();
  return {
    keys: async () => [...entries.keys()].map((url) => new Request(url)),
    match: async (request: Request) => {
      const response = entries.get(request.url);
      return response ? basicClone(response) : undefined;
    },
    put: async (request: Request, response: Response) => {
      entries.set(request.url, basicClone(response));
    },
    delete: async (request: Request) => entries.delete(request.url),
    entries,
  };
}

function sandbox() {
  const handlers: Record<string, (event: {
    request?: Request;
    waitUntil?: (promise: Promise<unknown>) => void;
    respondWith?: (promise: Promise<Response>) => void;
  }) => void> = {};
  const cachesByName = new Map<string, ReturnType<typeof fakeCache>>();
  const cacheStorage = {
    keys: async () => [...cachesByName.keys()],
    open: async (name: string) => {
      if (!cachesByName.has(name)) cachesByName.set(name, fakeCache());
      return cachesByName.get(name)!;
    },
    delete: async (name: string) => cachesByName.delete(name),
  };
  const fetcher = vi.fn(async () => browserResponse('public asset'));
  const self = {
    location: { origin },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener: (event: string, handler: typeof handlers[string]) => {
      handlers[event] = handler;
    },
  };
  runInNewContext(sw, {
    self, caches: cacheStorage, Request, Response, URL, Set, fetch: fetcher,
  });
  const get = async (path: string, headers?: HeadersInit) => {
    let response: Promise<Response> | undefined;
    handlers.fetch!({
      request: new Request(origin + path, headers ? { headers } : {}),
      respondWith: (promise) => { response = promise; },
    });
    return response ? await response : null;
  };
  const activate = async () => {
    let operation: Promise<unknown> | undefined;
    handlers.activate!({ waitUntil: (promise) => { operation = promise; } });
    await operation;
  };
  return { get, activate, cachesByName, cacheStorage, fetcher };
}

describe('Guest Service Worker public-only cache contract', () => {
  it('does not intercept navigation-like paths, APIs, PIN/QR, payment, or arbitrary images', async () => {
    const { get, cachesByName, fetcher } = sandbox();
    expect(await get('/api/v1/guest/session')).toBeNull();
    expect(await get('/v1/guest/browser-session/switch/reconcile')).toBeNull();
    expect(await get('/session/handoff-verification/rotate')).toBeNull();
    expect(await get('/private/receipt.svg')).toBeNull();
    expect(await get('/sensitive/payment.png')).toBeNull();
    expect(await get('/')).toBeNull();
    expect(cachesByName.size).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('caches explicit public icon and hashed Next chunks only; no Authorization requests', async () => {
    const { get, cachesByName, fetcher } = sandbox();
    expect(await get('/icons/icon-192.png')).not.toBeNull();
    expect(await get('/_next/static/chunks/abc-987654.js')).not.toBeNull();
    expect(await get('/manifest.webmanifest')).not.toBeNull();
    expect(await get('/icons/icon-192.png', { Authorization: 'Bearer secret' })).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(3);
    const assets = cachesByName.get('vaylet-guest-public-static-r2')!;
    expect(assets.entries.size).toBe(3);
  });

  it('serves the Slate manifest and Apple icons through the exact public allowlist', async () => {
    const { get, cachesByName } = sandbox();
    const publicRoot = new URL('../../../public/', import.meta.url);
    const manifest: { icons: { src: string; sizes: string; type: string; purpose: string }[] } =
      JSON.parse(readFileSync(new URL('manifest.webmanifest', publicRoot), 'utf8'));
    expect(manifest).toMatchObject({
      name: 'VAYLET Guest',
      short_name: 'VAYLET',
      start_url: '/',
      scope: '/',
      display: 'standalone',
    });
    expect(manifest).not.toHaveProperty('id');
    expect(manifest.icons.map(({ sizes, purpose }) => [sizes, purpose])).toEqual([
      ['192x192', 'any'],
      ['512x512', 'any'],
      ['512x512', 'maskable'],
    ]);
    const apple = { src: '/icons/guest-slate-v1/apple-touch-icon.png', sizes: '180x180', type: 'image/png' };
    for (const icon of [...manifest.icons, apple]) {
      expect(icon.src).toMatch(/^\/icons\/guest-slate-v1\/[^/]+\.png$/);
      expect(icon.type).toBe('image/png');
      const png = readFileSync(new URL(icon.src.slice(1), publicRoot));
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      const dimensions = [png.readUInt32BE(16), png.readUInt32BE(20)];
      expect(dimensions.join('x')).toBe(icon.sizes);
      expect(await get(icon.src)).not.toBeNull();
      expect(await get(icon.src, { Authorization: 'Bearer test' })).toBeNull();
    }
    expect(await get('/icons/guest-slate-v1/unlisted.png')).toBeNull();
    expect(await get('/icons/guest-slate-v1/icon-192.png?v=1')).toBeNull();
    expect(cachesByName.get('vaylet-guest-public-static-r2')?.entries.size).toBe(4);
  });

  it('fetches versioned artwork independently of an already cached legacy icon', async () => {
    const { get, fetcher, cacheStorage } = sandbox();
    const cache = await cacheStorage.open('vaylet-guest-public-static-r2');
    const oldPath = '/icons/icon-512.png';
    const newPath = '/icons/guest-slate-v1/icon-512.png';
    await cache.put(new Request(origin + oldPath), browserResponse('legacy artwork'));

    fetcher.mockRejectedValueOnce(new Error('offline'));
    await expect(get(newPath)).rejects.toThrow('offline');
    fetcher.mockResolvedValueOnce(browserResponse('approved Slate artwork'));
    expect(await (await get(newPath))?.text()).toBe('approved Slate artwork');
    fetcher.mockRejectedValueOnce(new Error('offline'));
    expect(await (await get(newPath))?.text()).toBe('approved Slate artwork');
    fetcher.mockRejectedValueOnce(new Error('offline'));
    expect(await (await get(oldPath))?.text()).toBe('legacy artwork');
  });

  it('migrates only allowlisted public assets from old cache and keeps unrelated caches', async () => {
    const { activate, cachesByName, cacheStorage } = sandbox();
    const old = await cacheStorage.open('vaylet-static-v1');
    await old.put(new Request(origin + '/_next/static/chunks/older-hash.js'), browserResponse('old'));
    await old.put(new Request(origin + '/private/receipt.png'), browserResponse('private'));
    await cacheStorage.open('another-app-auth-cache');
    await activate();
    const current = cachesByName.get('vaylet-guest-public-static-r2')!;
    expect([...current.entries.keys()]).toEqual([origin + '/_next/static/chunks/older-hash.js']);
    expect(cachesByName.has('vaylet-static-v1')).toBe(false);
    expect(cachesByName.has('another-app-auth-cache')).toBe(true);
  });

  it('rejects private/no-store/set-cookie responses even at allowlisted paths during migration and fetch', async () => {
    const { activate, get, cacheStorage, fetcher } = sandbox();
    const old = await cacheStorage.open('vaylet-static-v1');
    await old.put(new Request(origin + '/_next/static/chunks/private.js'),
      browserResponse('not public', { 'Cache-Control': 'private, no-store' }));
    await old.put(new Request(origin + '/icons/icon-192.png'),
      browserResponse('credential-bearing', { 'Set-Cookie': 'session=hidden' }));
    const current = await cacheStorage.open('vaylet-guest-public-static-r2');
    await current.put(new Request(origin + '/_next/static/chunks/previously-migrated.js'),
      browserResponse('bad old entry', { 'Cache-Control': 'no-store' }));
    await activate();
    expect(current.entries.size).toBe(0);
    fetcher.mockResolvedValueOnce(browserResponse('private fresh', { 'Cache-Control': 'private' }));
    expect(await get('/_next/static/chunks/sensitive.js')).not.toBeNull();
    expect(current.entries.size).toBe(0);
  });

  it('prunes the application-owned public cache to at most 240 entries', async () => {
    const { activate, cacheStorage, cachesByName } = sandbox();
    const cache = await cacheStorage.open('vaylet-guest-public-static-r2');
    for (let index = 0; index < 251; index += 1) {
      await cache.put(new Request(`${origin}/_next/static/chunks/public-${index}.js`),
        browserResponse(`chunk ${index}`));
    }
    await cacheStorage.open('unrelated-app');
    await activate();
    expect(cachesByName.get('vaylet-guest-public-static-r2')?.entries.size).toBe(240);
    expect(cachesByName.has('unrelated-app')).toBe(true);
  });
});
