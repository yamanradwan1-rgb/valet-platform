import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const sw = readFileSync(new URL('../../../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://guest.example.test';

function browserResponse(content: string): Response {
  const response = new Response(content, { status: 200 });
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
});
