import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGuestWebPushTransport } from './guest-web-push-transport';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const baseUrl = 'https://guest.example.test/api/v1/guest';
const subscription = {
  endpoint: 'https://push.example.test/sub',
  auth: 'auth-value',
  locale: 'en' as const,
  p256dh: 'p256dh-value',
};

describe('Guest Web Push API transport', () => {
  it('loads only enabled public VAPID configuration with cookie/no-store transport', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ enabled: true, publicKey: 'public-vapid-key' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetcher);
    const transport = createGuestWebPushTransport(baseUrl);
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
    const transport = createGuestWebPushTransport(baseUrl);
    await transport.registerSubscription(subscription);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://guest.example.test/api/v1/guest/push/registration');
    expect(init).toEqual(expect.objectContaining({
      method: 'POST', cache: 'no-store', credentials: 'same-origin', redirect: 'error',
      body: JSON.stringify({
        endpoint: 'https://push.example.test/sub', auth: 'auth-value', locale: 'en', p256dh: 'p256dh-value',
      }),
    }));
    expect(init?.headers).toEqual(expect.objectContaining({
      'Content-Type': 'application/json',
      'x-vaylet-guest-session': 'v1',
    }));
  });

  it.each([
    [200, 'application/json', '{}'],
    [200, 'text/html', '<html><body>Next.js fallback</body></html>'],
    [204, 'text/html', null],
  ])('rejects an unexpected %i %s registration response', async (status, contentType, body) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, {
      status,
      headers: { 'Content-Type': contentType },
    })));
    await expect(createGuestWebPushTransport(baseUrl).registerSubscription(subscription))
      .rejects.toMatchObject({ code: 'MUTATION_OUTCOME_UNKNOWN', status });
  });

  it('rejects a followed redirect even when the final response is 204', async () => {
    const redirected = new Response(null, { status: 204 });
    Object.defineProperty(redirected, 'redirected', { value: true });
    const fetcher = vi.fn<typeof fetch>(async () => redirected);
    vi.stubGlobal('fetch', fetcher);
    await expect(createGuestWebPushTransport(baseUrl).registerSubscription(subscription))
      .rejects.toMatchObject({ code: 'MUTATION_OUTCOME_UNKNOWN', status: 204 });
    expect(fetcher.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ redirect: 'error' }));
  });

  it('rejects a mismatched final response URL even without a redirect flag', async () => {
    const unexpected = new Response(null, { status: 204 });
    Object.defineProperty(unexpected, 'url', { value: 'https://guest.example.test/login' });
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => unexpected));
    await expect(createGuestWebPushTransport(baseUrl).registerSubscription(subscription))
      .rejects.toMatchObject({ code: 'MUTATION_OUTCOME_UNKNOWN', status: 204 });
  });

  it('keeps structured API errors and retry-after handling for rejected registration', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ code: 'GUEST_ACCESS_RATE_LIMITED' }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '30' } },
    )));
    await expect(createGuestWebPushTransport(baseUrl).registerSubscription(subscription))
      .rejects.toMatchObject({ code: 'GUEST_ACCESS_RATE_LIMITED', status: 429, retryAfter: 30 });
  });

  it('treats a lost response after a potentially committed POST as unknown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(createGuestWebPushTransport(baseUrl).registerSubscription(subscription))
      .rejects.toMatchObject({ code: 'MUTATION_OUTCOME_UNKNOWN', isNetworkError: true });
  });

  it('bounds a fetch promise that ignores abort without confirming registration', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(async () => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetcher);
    const pending = expect(createGuestWebPushTransport(baseUrl).registerSubscription(subscription))
      .rejects.toMatchObject({ code: 'MUTATION_OUTCOME_UNKNOWN' });
    await vi.advanceTimersByTimeAsync(12_000);
    await pending;
    expect((fetcher.mock.calls[0]?.[1]?.signal as AbortSignal).aborted).toBe(true);
  });

  it('does not send a pre-aborted request, and treats in-flight abort as uncertain', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetcher);
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await expect(createGuestWebPushTransport(baseUrl).registerSubscription(
      subscription, alreadyAborted.signal,
    )).rejects.toMatchObject({ code: 'GUEST_REQUEST_CANCELLED' });
    expect(fetcher).not.toHaveBeenCalled();

    const inFlight = new AbortController();
    const pending = createGuestWebPushTransport(baseUrl).registerSubscription(subscription, inFlight.signal);
    inFlight.abort();
    await expect(pending).rejects.toMatchObject({ code: 'MUTATION_OUTCOME_UNKNOWN' });
  });

  it('fails closed when production configuration is disabled', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ enabled: false, publicKey: null }), { status: 200 },
    )));
    const transport = createGuestWebPushTransport(baseUrl);
    await expect(transport.loadVapidPublicKey()).rejects.toThrow('unavailable');
  });
});
