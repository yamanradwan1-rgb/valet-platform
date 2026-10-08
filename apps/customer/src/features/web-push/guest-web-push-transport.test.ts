import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGuestWebPushTransport } from './guest-web-push-transport';

afterEach(() => vi.unstubAllGlobals());

describe('Guest Web Push API transport', () => {
  it('loads only enabled public VAPID configuration with cookie/no-store transport', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ enabled: true, publicKey: 'public-vapid-key' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetcher);
    const transport = createGuestWebPushTransport('https://guest.example.test/api/v1/guest');
    await expect(transport.loadVapidPublicKey()).resolves.toBe('public-vapid-key');
    expect(fetcher).toHaveBeenCalledWith(
      'https://guest.example.test/api/v1/guest/push/config',
      expect.objectContaining({ method: 'GET', cache: 'no-store', credentials: 'same-origin' }),
    );
  });

  it('posts the exact flat subscription contract with the Guest CSRF fence', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);
    const transport = createGuestWebPushTransport('https://guest.example.test/api/v1/guest');
    await transport.registerSubscription({
      endpoint: 'https://push.example.test/sub',
      auth: 'auth-value',
      locale: 'en',
      p256dh: 'p256dh-value',
    });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://guest.example.test/api/v1/guest/push/registration');
    expect(init).toEqual(expect.objectContaining({
      method: 'POST', cache: 'no-store', credentials: 'same-origin',
      body: JSON.stringify({
        endpoint: 'https://push.example.test/sub', auth: 'auth-value', locale: 'en', p256dh: 'p256dh-value',
      }),
    }));
    expect(init?.headers).toEqual(expect.objectContaining({
      'Content-Type': 'application/json',
      'x-vaylet-guest-session': 'v1',
    }));
  });

  it('fails closed when production configuration is disabled', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ enabled: false, publicKey: null }), { status: 200 },
    )));
    const transport = createGuestWebPushTransport('https://guest.example.test/api/v1/guest');
    await expect(transport.loadVapidPublicKey()).rejects.toThrow('unavailable');
  });
});
