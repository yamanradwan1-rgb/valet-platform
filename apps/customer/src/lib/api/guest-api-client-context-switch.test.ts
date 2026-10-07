import { afterEach, describe, expect, it, vi } from 'vitest';

import { GuestApiClient } from './guest-api-client';

describe('GuestApiClient context switch', () => {
  const token = 'guest-test-bearer-token-12345';
  const customBaseUrl = 'http://test-server/api/v1/guest';
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the narrow dual-source transition contract only for prepare and switch', async () => {
    const client = new GuestApiClient(token, customBaseUrl);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: 'CONTEXT_CONFLICT', currentScope: 'ACTIVE' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: 'SWITCHED' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    expect(await client.prepareBrowserSession()).toEqual({
      result: 'CONTEXT_CONFLICT',
      currentScope: 'ACTIVE',
    });
    expect(await client.switchBrowserContext()).toEqual({ result: 'SWITCHED' });
    for (const call of fetchSpy.mock.calls) {
      expect(call[1]).toEqual(
        expect.objectContaining({
          method: 'POST',
          credentials: 'same-origin',
          body: '{}',
          headers: expect.objectContaining({
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'x-vaylet-guest-session': 'v1',
          }),
        }),
      );
    }
  });

  it('reconciles a committed switch using cookie authority without Authorization', async () => {
    const cookieClient = GuestApiClient.browserSession(customBaseUrl);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ result: 'RECOVERED' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(cookieClient.reconcileBrowserContextSwitch()).resolves.toEqual({
      result: 'RECOVERED',
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://test-server/api/v1/guest/browser-session/switch/reconcile',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-vaylet-guest-session': 'v1',
        },
      }),
    );
  });

  it('fences stale cookie clients before sending a request when the browser context marker changed', async () => {
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;
    const contextOne = `vgc1.${'a'.repeat(32)}`;
    const contextTwo = `vgc1.${'b'.repeat(32)}`;
    let cookie = `__Host-vaylet_guest_context=${contextOne}`;
    const target = new EventTarget();
    vi.stubGlobal('document', { get cookie() { return cookie; } });
    vi.stubGlobal('window', target);
    const changed = vi.fn();
    target.addEventListener('vaylet:guest-context-changed', changed);
    const cookieClient = GuestApiClient.browserSession(customBaseUrl);
    cookie = `__Host-vaylet_guest_context=${contextTwo}`;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(cookieClient.loadSession()).rejects.toMatchObject({
      code: 'GUEST_CONTEXT_CHANGED',
      status: 409,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledTimes(1);
    vi.stubGlobal('document', originalDocument);
    vi.stubGlobal('window', originalWindow);
  });

  it('drops an old in-flight response after a successful context switch marker change', async () => {
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;
    const contextOne = `vgc1.${'c'.repeat(32)}`;
    const contextTwo = `vgc1.${'d'.repeat(32)}`;
    let cookie = `__Host-vaylet_guest_context=${contextOne}`;
    vi.stubGlobal('document', { get cookie() { return cookie; } });
    vi.stubGlobal('window', new EventTarget());
    const cookieClient = GuestApiClient.browserSession(customBaseUrl);
    let release!: (response: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      () => new Promise<Response>((resolve) => { release = resolve; }),
    );

    const inFlight = cookieClient.loadSession();
    cookie = `__Host-vaylet_guest_context=${contextTwo}`;
    release(
      new Response(
        JSON.stringify({
          readyAt: null,
          valetSessionId: validUuid,
          state: 'PARKED',
          vehicle: { make: 'Old', model: 'Visit', color: 'Black' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(inFlight).rejects.toMatchObject({ code: 'GUEST_CONTEXT_CHANGED' });
    vi.stubGlobal('document', originalDocument);
    vi.stubGlobal('window', originalWindow);
  });
});
