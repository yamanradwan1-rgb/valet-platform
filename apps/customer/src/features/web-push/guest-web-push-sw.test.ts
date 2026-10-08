import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const sw = readFileSync(new URL('../../../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://guest.example.test';

interface WindowClientStub {
  readonly url: string;
  readonly focus: () => Promise<unknown>;
}

interface ServiceWorkerEventStub {
  readonly data?: { readonly json: () => unknown };
  readonly notification?: { readonly close: () => void; readonly data?: unknown };
  readonly request?: Request;
  readonly waitUntil?: (promise: Promise<unknown>) => void;
  readonly respondWith?: (promise: Promise<Response>) => void;
}

function sandbox() {
  const handlers: Record<string, (event: ServiceWorkerEventStub) => void> = {};
  const showNotification = vi.fn(async () => undefined);
  const openWindow = vi.fn(async () => undefined);
  const matchAll = vi.fn(async (): Promise<WindowClientStub[]> => []);
  const self = {
    location: { origin },
    registration: { showNotification },
    clients: { claim: async () => {}, matchAll, openWindow },
    skipWaiting: async () => {},
    addEventListener: (type: string, handler: (event: ServiceWorkerEventStub) => void) => {
      handlers[type] = handler;
    },
  };
  runInNewContext(sw, {
    self,
    caches: { keys: async () => [], open: async () => ({ keys: async () => [] }), delete: async () => true },
    Request, Response, URL, Set, fetch: vi.fn(), Object, Promise,
  });
  const push = async (payload: unknown) => {
    let operation: Promise<unknown> | undefined;
    handlers.push!({
      data: { json: () => payload },
      waitUntil: (promise: Promise<unknown>) => { operation = promise; },
    });
    await operation;
  };
  const click = async (data: unknown, clients: WindowClientStub[] = []) => {
    matchAll.mockResolvedValueOnce(clients);
    let operation: Promise<unknown> | undefined;
    const close = vi.fn();
    handlers.notificationclick!({
      notification: { close, data },
      waitUntil: (promise: Promise<unknown>) => { operation = promise; },
    });
    await operation;
    return close;
  };
  return { click, handlers, matchAll, openWindow, push, showNotification };
}

const payload = (locale: 'en' | 'ar') => ({
  schemaVersion: 1,
  kind: 'GUEST_VEHICLE_READY',
  intentId: 'a4f01d68-b8de-4d67-a389-775704ef3250',
  routeIntent: 'GUEST_STATUS',
  locale,
});

describe('Guest Web Push service worker', () => {
  it('renders only immutable approved EN/AR copy and an opaque dedupe tag', async () => {
    const box = sandbox();
    await box.push(payload('en'));
    expect(box.showNotification).toHaveBeenLastCalledWith('Your vehicle is ready', {
      body: 'Your vehicle has arrived at the pickup area.',
      data: { routeIntent: 'GUEST_STATUS' },
      tag: 'guest-ready:a4f01d68-b8de-4d67-a389-775704ef3250',
    });
    await box.push(payload('ar'));
    expect(box.showNotification).toHaveBeenLastCalledWith('سيارتك جاهزة', {
      body: 'وصلت مركبتك إلى منطقة الاستلام وهي جاهزة لك.',
      data: { routeIntent: 'GUEST_STATUS' },
      tag: 'guest-ready:a4f01d68-b8de-4d67-a389-775704ef3250',
    });
  });

  it('ignores unknown schema, kind, route, locale, or malformed intent IDs', async () => {
    const box = sandbox();
    await box.push({ ...payload('en'), schemaVersion: 2 });
    await box.push({ ...payload('en'), kind: 'OTHER' });
    await box.push({ ...payload('en'), routeIntent: 'https://evil.test' });
    await box.push({ ...payload('en'), locale: 'fr' });
    await box.push({ ...payload('en'), intentId: 'guest-token-or-url' });
    expect(box.showNotification).not.toHaveBeenCalled();
  });

  it('focuses an existing same-origin client and never follows notification data as a URL', async () => {
    const box = sandbox();
    const focus = vi.fn(async () => undefined);
    await box.click({ routeIntent: 'GUEST_STATUS', url: 'https://evil.test/?token=secret' }, [
      { url: `${origin}/current`, focus },
    ]);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(box.openWindow).not.toHaveBeenCalled();
  });

  it('opens only the public root when no same-origin client exists', async () => {
    const box = sandbox();
    await box.click({ routeIntent: 'GUEST_STATUS' }, [{ url: 'https://other.example.test/', focus: vi.fn() }]);
    expect(box.openWindow).toHaveBeenCalledWith('/');
    await box.click({ routeIntent: 'OTHER' });
    expect(box.openWindow).toHaveBeenCalledTimes(1);
  });
});
