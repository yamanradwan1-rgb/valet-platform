import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { findElement, installTestDom, invokeReactClick, type TestElement,
  type TestDocument } from '../../app/guest-refresh-mounted.test-host';
import { GUEST_CONTEXT_CHANGED_EVENT } from '../../lib/api/guest-browser-context-marker';
import type { GuestWebPushTransport } from './guest-web-push-client';

const client = vi.hoisted(() => ({ enable: vi.fn() }));
vi.mock('./guest-web-push-client', () => ({
  detectGuestWebPushCapability: () => 'AVAILABLE',
  readGuestWebPushCapability: () => ({}),
  enableGuestWebPush: client.enable,
}));
vi.mock('../../i18n/use-translation', () => ({
  useTranslation: () => ({ locale: 'en', direction: 'ltr' }),
}));

import { GuestWebPushPermissionCard } from './guest-web-push-permission-card';

const FIRST_CONTEXT = 'vgc1.11111111111111111111111111111111';
const SECOND_CONTEXT = 'vgc1.22222222222222222222222222222222';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe('Guest Web Push permission card mounted lifecycle', () => {
  let root: Root | null;
  let container: TestElement;
  let document: TestDocument;
  let window: ReturnType<typeof installTestDom>['window'];
  let loadKey: Mock<(signal?: AbortSignal) => Promise<string>>;
  let transport: GuestWebPushTransport;

  beforeEach(() => {
    ({ document, window } = installTestDom());
    Object.assign(document, { cookie: `__Host-vaylet_guest_context=${FIRST_CONTEXT}` });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
    loadKey = vi.fn(async () => 'public-key');
    transport = { loadVapidPublicKey: loadKey, registerSubscription: vi.fn() };
    client.enable.mockReset();
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function mount() {
    const priorChecks = loadKey.mock.calls.length;
    await act(async () => root?.render(<GuestWebPushPermissionCard transport={transport} />));
    expect(loadKey).toHaveBeenCalledTimes(priorChecks + 1);
    expect(loadKey).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(container.textContent).toContain('Enable notifications');
  }

  async function click(text: string) {
    await act(async () => invokeReactClick(findElement(container, 'button', text)));
  }

  it('single-flights rapid Enable taps and shows success only on completed bind', async () => {
    const pending = deferred<'ENABLED' | 'AVAILABLE'>();
    client.enable.mockReturnValue(pending.promise);
    await mount();
    await act(async () => {
      const enable = findElement(container, 'button', 'Enable notifications');
      invokeReactClick(enable);
      invokeReactClick(enable);
    });
    expect(client.enable).toHaveBeenCalledTimes(1);
    expect(client.enable).toHaveBeenCalledWith(transport, 'en', expect.any(AbortSignal));
    expect(container.textContent).toContain('Not now');
    expect(container.textContent).not.toContain('Enable notifications');
    await act(async () => pending.resolve('AVAILABLE'));
    expect(container.textContent).toContain('Enable notifications');
    client.enable.mockResolvedValueOnce('ENABLED');
    await click('Enable notifications');
    expect(client.enable).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe('');
  });

  it('Not now aborts immediately and drops a late successful native promise', async () => {
    const pending = deferred<'ENABLED'>();
    client.enable.mockReturnValue(pending.promise);
    await mount();
    await click('Enable notifications');
    const signal = client.enable.mock.calls[0]?.[2] as AbortSignal;
    expect(signal.aborted).toBe(false);
    await click('Not now');
    expect(signal.aborted).toBe(true);
    expect(container.textContent).toBe('');
    await act(async () => pending.resolve('ENABLED'));
    expect(container.textContent).toBe('');
    expect(client.enable).toHaveBeenCalledTimes(1);
  });

  it('unmount aborts and stale resolution cannot mutate remounted card', async () => {
    const pending = deferred<'ENABLED'>();
    client.enable.mockReturnValue(pending.promise);
    await mount();
    await click('Enable notifications');
    const signal = client.enable.mock.calls[0]?.[2] as AbortSignal;
    await act(async () => root?.unmount());
    expect(signal.aborted).toBe(true);
    root = createRoot(container as unknown as Element);
    client.enable.mockResolvedValueOnce('DENIED');
    await mount();
    await act(async () => pending.resolve('ENABLED'));
    expect(container.textContent).toContain('Enable notifications');
    expect(client.enable).toHaveBeenCalledTimes(1);
  });

  it('context change aborts active registration and hides obsolete card', async () => {
    const pending = deferred<'ENABLED'>();
    client.enable.mockReturnValue(pending.promise);
    await mount();
    await click('Enable notifications');
    const signal = client.enable.mock.calls[0]?.[2] as AbortSignal;
    await act(async () => {
      Object.assign(document, { cookie: `__Host-vaylet_guest_context=${SECOND_CONTEXT}` });
      (window as unknown as Window).dispatchEvent(new Event(GUEST_CONTEXT_CHANGED_EVENT));
    });
    expect(signal.aborted).toBe(true);
    expect(container.textContent).toBe('');
    await act(async () => pending.resolve('ENABLED'));
    expect(container.textContent).toBe('');
    expect(client.enable).toHaveBeenCalledTimes(1);
  });

  it('aborts an indefinitely pending VAPID config check at the deadline', async () => {
    const pending = deferred<string>();
    loadKey.mockReturnValue(pending.promise);
    vi.useFakeTimers();
    await act(async () => root?.render(<GuestWebPushPermissionCard transport={transport} />));
    const signal = loadKey.mock.calls[0]?.[0] as AbortSignal;
    expect(container.textContent).toBe('');
    await act(async () => vi.advanceTimersByTimeAsync(12_000));
    expect(signal.aborted).toBe(true);
    expect(container.textContent).toContain('Enable notifications');
    await act(async () => pending.resolve('old-key'));
    expect(container.textContent).toContain('Enable notifications');
    expect(loadKey).toHaveBeenCalledTimes(1);
  });

  it('bounds an unresolved enable and permits a clean retry without late results', async () => {
    const pending = deferred<'ENABLED'>();
    client.enable.mockReturnValueOnce(pending.promise).mockResolvedValueOnce('DENIED');
    await mount();
    vi.useFakeTimers();
    await click('Enable notifications');
    const signal = client.enable.mock.calls[0]?.[2] as AbortSignal;
    await act(async () => vi.advanceTimersByTimeAsync(35_000));
    expect(signal.aborted).toBe(true);
    expect(container.textContent).toContain('Enable notifications');
    await click('Enable notifications');
    expect(client.enable).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve('ENABLED'));
    expect(container.textContent).not.toContain('Enable notifications');
    expect(container.textContent).toContain('Not now');
  });
});
