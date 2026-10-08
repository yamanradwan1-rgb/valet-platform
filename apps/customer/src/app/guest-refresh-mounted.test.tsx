import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GuestApiClient } from '../lib/api/guest-api-client';
import type { GuestSafeSession } from '../lib/api/guest-api-types';
import { GuestSessionProvider } from '../features/session/guest-session-provider';
import { GuestAppRoot } from './guest-app-root';
import {
  findElement,
  installTestDom,
  invokeReactClick,
  type TestElement,
} from './guest-refresh-mounted.test-host';

const auth = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock('../features/auth/guest-auth-context', () => ({
  useGuestAuth: () => auth.current,
}));
vi.mock('../i18n/use-translation', () => ({
  useTranslation: () => ({
    locale: 'en', direction: 'ltr', isRtl: false,
    setLocale: vi.fn(), toggleLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));
vi.mock('../features/demo/dev-preview-controls', () => ({ DevPreviewControls: () => null }));
vi.mock('../theme/use-theme', () => ({
  useTheme: () => ({ theme: 'light', isDark: false, setTheme: vi.fn(), toggleTheme: vi.fn() }),
}));

const VISIT_A = '123e4567-e89b-12d3-a456-426614174000';
const VISIT_B = '223e4567-e89b-12d3-a456-426614174000';

function session(
  model: string,
  valetSessionId = VISIT_A,
  state: GuestSafeSession['state'] = 'AWAITING_PARKING',
): GuestSafeSession {
  return {
    valetSessionId,
    state,
    readyAt: null,
    vehicle: { make: 'Toyota', model, color: 'White' },
  };
}

function response(value: GuestSafeSession): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function temporaryFailure(): Response {
  return new Response(JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'Temporary failure' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function authState(client: GuestApiClient) {
  return {
    token: 'test-token', client, contextConflictScope: null,
    isTokenBootstrapComplete: true, isBootstrapTemporarilyUnavailable: false,
    isContextSwitching: false, isContextSwitchOutcomeAmbiguous: false,
    continueCurrentVisit: vi.fn(), openNewVisit: vi.fn(), retryBootstrap: vi.fn(), setToken: vi.fn(),
  };
}

function Tree() {
  return (
    <GuestSessionProvider>
      <GuestAppRoot />
    </GuestSessionProvider>
  );
}

async function flush() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe('mounted Guest refresh regression path', () => {
  let root: Root | null = null;
  let container: TestElement;

  beforeEach(() => {
    const dom = installTestDom();
    container = dom.document.createElement('div');
    dom.document.body.appendChild(container);
    auth.current = authState(new GuestApiClient('token-a'));
  });

  afterEach(async () => {
    if (root) await act(async () => { root?.unmount(); });
    root = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function mount() {
    root = createRoot(container as unknown as Element);
    await act(async () => {
      root?.render(<Tree />);
      await flush();
    });
  }

  async function click(text: string) {
    await act(async () => {
      invokeReactClick(findElement(container, 'button', text));
      await flush();
    });
  }

  it('refreshes through ScreenReceived and coalesces a second fast completed tap', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(session('Initial')))
      .mockResolvedValueOnce(response(session('Updated')));

    await mount();
    expect(container.textContent).toContain('Initial');

    await click('common.refresh');
    expect(container.textContent).toContain('Updated');
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await click('common.refresh');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('shares one GET when manual refresh overlaps a scheduled poll', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const pending = deferred<Response>();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(session('Initial')))
      .mockImplementationOnce(() => pending.promise);

    await mount();
    const button = findElement(container, 'button', 'common.refresh');
    await act(async () => {
      vi.advanceTimersByTime(21_000);
      await flush();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await act(async () => {
      invokeReactClick(button);
      await flush();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    pending.resolve(response(session('After overlap')));
    await act(async () => { await flush(); });
    expect(container.textContent).toContain('After overlap');
  });

  it('recovers from an initial temporary read failure through the rendered retry action', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(temporaryFailure())
      .mockResolvedValueOnce(response(session('Recovered')));

    await mount();
    expect(container.textContent).toContain('system.temporaryUnavailableTitle');
    await click('common.tryAgain');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Recovered');
    expect(container.textContent).toContain('common.refresh');
  });

  it('fences a late refresh from the replaced client context', async () => {
    const stale = deferred<Response>();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      const headers = init?.headers as Record<string, string> | undefined;
      const authorization = headers?.Authorization;
      if (authorization === 'Bearer token-b') return Promise.resolve(response(session('Visit B', VISIT_B)));
      if (fetchSpy.mock.calls.length === 1) return Promise.resolve(response(session('Visit A')));
      return stale.promise;
    });

    await mount();
    expect(container.textContent).toContain('Visit A');
    await act(async () => {
      invokeReactClick(findElement(container, 'button', 'common.refresh'));
      await flush();
    });

    auth.current = authState(new GuestApiClient('token-b'));
    await act(async () => {
      root?.render(<Tree />);
      await flush();
    });
    expect(container.textContent).toContain('Visit B');

    stale.resolve(response(session('Stale A')));
    await act(async () => { await flush(); });
    expect(container.textContent).toContain('Visit B');
    expect(container.textContent).not.toContain('Stale A');
  });

  it('does not refresh through the stale notice while Request Vehicle is pending', async () => {
    const request = deferred<Response>();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(session('Parked', VISIT_A, 'PARKED')))
      .mockImplementationOnce(() => request.promise)
      .mockResolvedValueOnce(response(session('Requested', VISIT_A, 'REQUESTED')));
    await mount();
    await click('parked.requestButton');
    await click('confirmRequest.confirmButton');
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await click('common.refresh');
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    request.resolve(response(session('Requested', VISIT_A, 'REQUESTED')));
    await act(async () => {
      await flush();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(container.textContent).toContain('requested.badge');
    expect(container.textContent).not.toContain('parked.requestButton');
  });
});
