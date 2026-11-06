import React, { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installTestDom } from '../../app/guest-refresh-mounted.test-host';
import { GuestAuthProvider, useGuestAuth } from './guest-auth-context';

const TOKEN = 'A'.repeat(43);
const OTHER_TOKEN = 'B'.repeat(43);
const FLAG = 'NEXT_PUBLIC_GUEST_BROWSER_SESSION_ENROLLMENT_ENABLED';

const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(value, { status, headers });
const denied = () => json({ code: 'GUEST_ACCESS_INVALID' }, 401);
const reconciled = () => json({ result: 'NONE' });
const prepared = () => json({ result: 'ENROLLMENT_READY' });
const exchanged = () => new Response(null, { status: 204 });
const rateLimited = () => json({ code: 'GUEST_ACCESS_RATE_LIMITED' }, 429, { 'Retry-After': '40' });
const unavailable = () => json({ code: 'SERVICE_UNAVAILABLE' }, 503);
const conflict = (currentScope: 'ACTIVE' | 'POST_VISIT' = 'ACTIVE') =>
  json({ result: 'CONTEXT_CONFLICT', currentScope });
const session = () => json({
  valetSessionId: '123e4567-e89b-12d3-a456-426614174000',
  state: 'PARKED',
  readyAt: null,
  vehicle: { make: 'Test', model: 'Fixture', color: 'White' },
});

describe('mounted Guest link navigation', () => {
  let root: Root | null;
  let auth: ReturnType<typeof useGuestAuth>;
  let browser: ReturnType<typeof installTestDom>;
  let location: { hash: string; pathname: string; search: string };
  let scrub: ReturnType<typeof vi.fn>;
  let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;

  function Probe() {
    auth = useGuestAuth();
    return <span>{auth.isTokenBootstrapComplete ? 'ready' : 'loading'}</span>;
  }

  const dispatch = (event: string) =>
    (browser.window.dispatchEvent as (event: Event) => void)(new Event(event));

  async function mount() {
    const container = browser.document.createElement('div');
    browser.document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
    await act(async () => root?.render(<StrictMode><GuestAuthProvider><Probe /></GuestAuthProvider></StrictMode>));
  }

  async function navigate(hash: string, event = 'hashchange') {
    await act(async () => {
      location.hash = hash;
      dispatch(event);
    });
  }

  const paths = () => fetchSpy.mock.calls.map(([url]) => String(url).split('/guest/')[1]);

  beforeEach(() => {
    browser = installTestDom();
    Object.defineProperty(browser.document, 'cookie', { value: '', writable: true });
    location = { hash: '', pathname: '/', search: '' };
    scrub = vi.fn(() => { location.hash = ''; });
    browser.window.location = location;
    browser.window.history = { replaceState: scrub };
    vi.stubEnv(FLAG, 'true');
    fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('scrubs and authorizes a pasted link on the already mounted page', async () => {
    fetchSpy.mockResolvedValueOnce(reconciled()).mockResolvedValueOnce(denied());
    await mount();
    await expect(auth.client?.loadSession()).rejects.toMatchObject({ status: 401 });
    fetchSpy.mockImplementationOnce(async () => {
      expect(location.hash).toBe('');
      return prepared();
    }).mockResolvedValueOnce(exchanged()).mockResolvedValueOnce(session());

    await navigate(`#guestToken=${TOKEN}`);

    expect(scrub).toHaveBeenCalledOnce();
    expect(auth.token).toBeNull();
    await expect(auth.client?.loadSession()).resolves.toMatchObject({ state: 'PARKED' });
    expect(paths()).toEqual([
      'browser-session/switch/reconcile', 'session', 'browser-session/prepare',
      'browser-session/exchange', 'session',
    ]);
  });

  it('handles cold entry under Strict Mode with a single transport operation', async () => {
    location.hash = `#guestToken=${TOKEN}`;
    fetchSpy.mockResolvedValueOnce(prepared()).mockResolvedValueOnce(exchanged());
    await mount();
    expect(scrub).toHaveBeenCalledOnce();
    expect(paths()).toEqual(['browser-session/prepare', 'browser-session/exchange']);
    expect(auth).toMatchObject({ token: null, isTokenBootstrapComplete: true });
  });

  it('preserves mounted state for unrelated, malformed, and unsrubbable fragments', async () => {
    fetchSpy.mockResolvedValueOnce(reconciled());
    await mount();
    const client = auth.client;
    await navigate('#details');
    expect(location.hash).toBe('#details');
    expect(scrub).not.toHaveBeenCalled();
    await navigate('#guestToken=short');
    expect(location.hash).toBe('');
    scrub.mockImplementationOnce(() => { throw new Error('history unavailable'); });
    await navigate(`#guestToken=${TOKEN}`);
    expect(auth.client).toBe(client);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it.each(['popstate', 'pageshow'])('consumes the current fragment once through %s', async (event) => {
    fetchSpy.mockResolvedValueOnce(reconciled()).mockResolvedValueOnce(prepared())
      .mockResolvedValueOnce(exchanged());
    await mount();
    await navigate(`#guestToken=${TOKEN}`, event);
    await act(async () => { dispatch('hashchange'); dispatch('pageshow'); });
    expect(scrub).toHaveBeenCalledOnce();
    expect(paths()).toEqual([
      'browser-session/switch/reconcile', 'browser-session/prepare', 'browser-session/exchange',
    ]);
  });

  it('serializes another link behind exchange and requires a choice for a different visit', async () => {
    let finishExchange!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => { finishExchange = resolve; });
    fetchSpy.mockResolvedValueOnce(prepared()).mockReturnValueOnce(pending)
      .mockResolvedValueOnce(conflict());
    location.hash = `#guestToken=${TOKEN}`;
    await mount();
    await navigate(`#guestToken=${TOKEN}`);
    await navigate(`#guestToken=${OTHER_TOKEN}`);
    expect(location.hash).toBe('');
    expect(paths()).toEqual(['browser-session/prepare', 'browser-session/exchange']);

    await act(async () => finishExchange(exchanged()));

    expect(auth).toMatchObject({ token: OTHER_TOKEN, contextConflictScope: 'ACTIVE' });
    expect(paths()).toEqual(['browser-session/prepare', 'browser-session/exchange', 'browser-session/prepare']);
    const client = auth.client;
    await act(async () => auth.continueCurrentVisit());
    expect(auth).toMatchObject({ token: null, contextConflictScope: null });
    expect(auth.client).toBe(client);
  });

  it('keeps the current cookie client for SAME_VISIT and non-disclosing denial', async () => {
    (browser.document as unknown as { cookie: string }).cookie =
      `__Host-vaylet_guest_context=vgc1.${'a'.repeat(32)}`;
    fetchSpy.mockResolvedValueOnce(reconciled()).mockResolvedValueOnce(json({ result: 'SAME_VISIT' }))
      .mockResolvedValueOnce(denied()).mockResolvedValueOnce(session());
    await mount();
    const client = auth.client;
    await navigate(`#guestToken=${TOKEN}`);
    await navigate(`#guestToken=${OTHER_TOKEN}`);
    expect(auth).toMatchObject({ client, token: null, contextConflictScope: null });
    expect(auth.client).toBe(client);
    await expect(client?.loadSession()).resolves.toMatchObject({ state: 'PARKED' });
    expect(paths()).toEqual([
      'browser-session/switch/reconcile', 'browser-session/prepare', 'browser-session/prepare', 'session',
    ]);
  });

  it('recovers missing authority in legacy mode but keeps an authorized visit on later re-entry', async () => {
    vi.stubEnv(FLAG, 'false');
    fetchSpy.mockResolvedValueOnce(denied()).mockResolvedValueOnce(session()).mockResolvedValueOnce(session());
    await mount();
    await navigate(`#guestToken=${TOKEN}`);
    const bearerClient = auth.client;
    await expect(bearerClient?.loadSession()).resolves.toMatchObject({ state: 'PARKED' });
    await navigate(`#guestToken=${OTHER_TOKEN}`);
    await navigate('');
    expect(auth.token).toBe(TOKEN);
    expect(auth.client).toBe(bearerClient);
    expect(paths()).toEqual(['session', 'session', 'session']);
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Authorization');
    expect(fetchSpy.mock.calls[2]?.[1]?.headers).toHaveProperty('Authorization', `Bearer ${TOKEN}`);
    fetchSpy.mockResolvedValueOnce(json({ code: 'GUEST_ACCESS_INVALID' }, 503));
    await navigate(`#guestToken=${OTHER_TOKEN}`);
    expect(auth.client).toBe(bearerClient);
    expect(auth.isBootstrapTemporarilyUnavailable).toBe(true);
  });

  it('waits behind a 429 and retries the original stage before preparing another link', async () => {
    vi.useFakeTimers();
    location.hash = `#guestToken=${TOKEN}`;
    fetchSpy.mockResolvedValueOnce(rateLimited()).mockResolvedValueOnce(prepared())
      .mockResolvedValueOnce(exchanged()).mockResolvedValueOnce(conflict());
    await mount();
    await navigate(`#guestToken=${OTHER_TOKEN}`);
    expect(auth).toMatchObject({ token: TOKEN, isBootstrapTemporarilyUnavailable: true });
    let retry: Promise<void> | undefined;
    await act(async () => { retry = auth.retryBootstrap(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(39_999); });
    expect(paths()).toEqual(['browser-session/prepare']);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); await retry; });
    expect(paths()).toEqual([
      'browser-session/prepare', 'browser-session/prepare', 'browser-session/exchange', 'browser-session/prepare',
    ]);
    expect(auth).toMatchObject({ token: OTHER_TOKEN, contextConflictScope: 'ACTIVE' });
  });

  it('keeps the same exchange pending after an unknown commit and a denied exact retry', async () => {
    location.hash = `#guestToken=${TOKEN}`;
    fetchSpy.mockResolvedValueOnce(prepared()).mockResolvedValueOnce(unavailable())
      .mockResolvedValueOnce(denied()).mockResolvedValueOnce(denied())
      .mockResolvedValueOnce(exchanged()).mockResolvedValueOnce(conflict());
    await mount();
    await navigate(`#guestToken=${OTHER_TOKEN}`);
    expect(auth).toMatchObject({ token: TOKEN, isBootstrapTemporarilyUnavailable: true });
    await act(async () => auth.retryBootstrap());
    expect(auth).toMatchObject({ token: TOKEN, isBootstrapTemporarilyUnavailable: true });
    expect(paths()).toEqual([
      'browser-session/prepare', 'browser-session/exchange', 'browser-session/exchange', 'browser-session/exchange',
    ]);
    await act(async () => auth.retryBootstrap());
    expect(auth).toMatchObject({ token: OTHER_TOKEN, contextConflictScope: 'ACTIVE' });
    expect(paths().slice(-2)).toEqual(['browser-session/exchange', 'browser-session/prepare']);
  });

  it.each(['same', 'changed'] as const)(
    'keeps lost exchange ambiguous even with a valid cookie and a %s marker',
    async (marker) => {
      const doc = browser.document as unknown as { cookie: string };
      doc.cookie = `__Host-vaylet_guest_context=vgc1.${'a'.repeat(32)}`;
      location.hash = `#guestToken=${TOKEN}`;
      fetchSpy.mockResolvedValueOnce(prepared()).mockResolvedValueOnce(unavailable())
        .mockResolvedValueOnce(unavailable()).mockResolvedValueOnce(denied());
      await mount();
      if (marker === 'changed') doc.cookie = `__Host-vaylet_guest_context=vgc1.${'b'.repeat(32)}`;
      fetchSpy.mockResolvedValueOnce(session());

      await act(async () => auth.retryBootstrap());

      expect(auth).toMatchObject({ token: TOKEN, isBootstrapTemporarilyUnavailable: true });
      expect(paths().at(-1)).toBe('browser-session/exchange');
    },
  );

  it('keeps a POST_VISIT switch intent after response loss, including on later navigation', async () => {
    document.cookie = `__Host-vaylet_guest_context=vgc1.${'a'.repeat(32)}`;
    location.hash = `#guestToken=${TOKEN}`;
    fetchSpy.mockResolvedValueOnce(conflict('POST_VISIT')).mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(unavailable())
      .mockResolvedValueOnce(json({ result: 'RECOVERED' })).mockResolvedValueOnce(conflict());
    await mount();
    const source = auth.client;
    await act(async () => auth.openNewVisit());
    await navigate(`#guestToken=${OTHER_TOKEN}`);
    await act(async () => auth.continueCurrentVisit());
    expect(auth.client).toBe(source);
    expect(auth).toMatchObject({
      token: TOKEN, contextConflictScope: 'POST_VISIT', isContextSwitchOutcomeAmbiguous: true,
    });
    expect(paths()).toEqual(['browser-session/prepare', 'browser-session/switch', 'browser-session/switch']);
    await act(async () => auth.openNewVisit());
    expect(paths().slice(-2)).toEqual([
      'browser-session/switch', 'browser-session/prepare',
    ]);
    expect(auth.client).not.toBe(source);
    expect(auth).toMatchObject({ token: OTHER_TOKEN, contextConflictScope: 'ACTIVE' });
  });

  it('removes listeners and cannot start an exchange from a detached prepare', async () => {
    let finishPrepare!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => { finishPrepare = resolve; });
    location.hash = `#guestToken=${TOKEN}`;
    fetchSpy.mockReturnValueOnce(pending).mockResolvedValueOnce(prepared()).mockResolvedValueOnce(exchanged());
    await mount();
    await act(async () => root?.unmount());
    root = null;
    await navigate(`#guestToken=${OTHER_TOKEN}`);
    expect(location.hash).not.toBe('');
    await mount();
    expect(location.hash).toBe('');
    expect(paths()).toEqual(['browser-session/prepare']);
    await act(async () => finishPrepare(prepared()));
    expect(paths()).toEqual(['browser-session/prepare', 'browser-session/prepare', 'browser-session/exchange']);
    expect(fetchSpy.mock.calls[1]?.[1]?.headers).toHaveProperty('Authorization', `Bearer ${OTHER_TOKEN}`);
  });
});
