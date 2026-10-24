import { afterEach, describe, expect, it, vi } from 'vitest';

import { GuestApiError } from '../../lib/api/api-error';
import { GuestApiClient } from '../../lib/api/guest-api-client';
import {
  failedBootstrapState,
  failedGuestContextSwitchState,
  isRetryableGuestAuthBootstrapFailure,
  retryGuestAuthBootstrapTransport,
  runGuestAuthBootstrap,
  type GuestAuthBootstrapStage,
} from './guest-auth-bootstrap';
import {
  guestAuthRetryNotBefore,
  recoverGuestAuth429Once,
  waitForGuestAuthRetry,
} from './guest-auth-rate-limit';

const TOKEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef012345678-_';
const json = (body: unknown, status = 200, retryAfter?: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(retryAfter === undefined ? {} : { 'Retry-After': retryAfter }),
    },
  });
const rateLimited = (seconds = '2') =>
  json({ code: 'GUEST_ACCESS_RATE_LIMITED', message: 'Wait' }, 429, seconds);
const ready = () => json({ result: 'ENROLLMENT_READY' });

function startWithOneDeferredRetry(
  token: string | null,
  isCurrent: () => boolean = () => true,
) {
  let stage: GuestAuthBootstrapStage = token === null ? 'RECONCILE_SWITCH' : 'PREPARE';
  const start = recoverGuestAuth429Once(
    () => runGuestAuthBootstrap(token, true, (next) => { stage = next; }),
    () => retryGuestAuthBootstrapTransport(token, true, stage, (next) => { stage = next; }),
    isCurrent,
  );
  // Rejections expected after a fake-timer tick must already have a handler.
  void start.catch(() => undefined);
  return { start, stage: () => stage };
}

describe('Guest 429 recovery after fragment scrub', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('honors full Retry-After, guarding unrepresentable values without early retries', () => {
    const makeError = (retryAfter?: number) => new GuestApiError({
      status: 429,
      code: 'GUEST_ACCESS_RATE_LIMITED',
      message: 'Limited',
      retryAfter,
    });
    expect(guestAuthRetryNotBefore(makeError(), 100)).toBe(1100);
    expect(guestAuthRetryNotBefore(makeError(0), 100)).toBe(1100);
    expect(guestAuthRetryNotBefore(makeError(Number.MAX_SAFE_INTEGER), 100))
      .toBe(Number.POSITIVE_INFINITY);
    expect(guestAuthRetryNotBefore(makeError(1200), 100)).toBe(1_200_100);
    expect(guestAuthRetryNotBefore(new Error('offline'), 100)).toBeNull();
  });

  it('defers a 429 prepare and resumes the same scrubbed bearer, without an immediate loop', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(ready())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const pending = startWithOneDeferredRetry(TOKEN);
    await vi.advanceTimersByTimeAsync(0);
    expect(pending.stage()).toBe('PREPARE');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending.start).resolves.toMatchObject({ token: null, contextConflictScope: null });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[1]?.[0]).toContain('/browser-session/prepare');
    expect(fetchSpy.mock.calls[2]?.[0]).toContain('/browser-session/exchange');
  });

  it('resumes a 429 exchange from EXCHANGE, reconciling a subsequent lost response', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ready())
      .mockResolvedValueOnce(rateLimited('1'))
      .mockRejectedValueOnce(new TypeError('response lost after commit'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const pending = startWithOneDeferredRetry(TOKEN);
    await vi.advanceTimersByTimeAsync(0);
    expect(pending.stage()).toBe('EXCHANGE');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending.start).resolves.toMatchObject({ token: null });
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    for (const call of fetchSpy.mock.calls.slice(1)) {
      expect(call[0]).toContain('/browser-session/exchange');
    }
  });

  it('defers cookie-only RECONCILE_SWITCH on 429 and recovers without a bearer', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(rateLimited('1'))
      .mockResolvedValueOnce(json({ result: 'RECOVERED' }));
    const pending = startWithOneDeferredRetry(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(pending.stage()).toBe('RECONCILE_SWITCH');
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending.start).resolves.toMatchObject({ token: null });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    for (const call of fetchSpy.mock.calls) {
      expect(call[0]).toContain('/browser-session/switch/reconcile');
      expect((call[1]?.headers as Record<string, string>).Authorization).toBeUndefined();
    }
  });

  it('stops after one deferred 429 and keeps the exact EXCHANGE stage recoverable', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ready())
      .mockResolvedValueOnce(rateLimited('1'))
      .mockResolvedValueOnce(rateLimited('9999999999999'));
    const pending = startWithOneDeferredRetry(TOKEN);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    const failure = await pending.start.catch((error: unknown) => error);
    expect(failure).toMatchObject({ status: 429 });
    const state = failedBootstrapState(TOKEN, true, failure, pending.stage());
    expect(state).toMatchObject({
      token: TOKEN,
      retryStage: 'EXCHANGE',
      isTemporarilyUnavailable: true,
    });
    expect(state.retryNotBefore).toBe(Number.POSITIVE_INFINITY);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('does not auto retry a 40-second Retry-After and preserves eligibility at its deadline', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(rateLimited('40'))
      .mockResolvedValueOnce(ready())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const pending = startWithOneDeferredRetry(TOKEN);
    await vi.advanceTimersByTimeAsync(0);
    const failure = await pending.start.catch((error: unknown) => error);
    const state = failedBootstrapState(TOKEN, true, failure, pending.stage());
    expect(state.retryStage).toBe('PREPARE');
    expect((state.retryNotBefore ?? 0) - Date.now()).toBe(40_000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await waitForGuestAuthRetry(state.retryNotBefore!, () => true)).toBe(false);
    await vi.advanceTimersByTimeAsync(39_999);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const eligible = waitForGuestAuthRetry(state.retryNotBefore!, () => true);
    await vi.advanceTimersByTimeAsync(1);
    expect(await eligible).toBe(true);
    const resumed = retryGuestAuthBootstrapTransport(TOKEN, true, state.retryStage!);
    await expect(resumed).resolves.toMatchObject({ token: null });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('fences a deferred attempt after context change, despite the timer firing', async () => {
    vi.useFakeTimers();
    let current = true;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(rateLimited('1'));
    const pending = startWithOneDeferredRetry(TOKEN, () => current);
    await vi.advanceTimersByTimeAsync(0);
    current = false;
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending.start).rejects.toMatchObject({ status: 429 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not resurrect a revoked bearer or fall back to another visit', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(rateLimited('1'))
      .mockResolvedValueOnce(json({ code: 'GUEST_ACCESS_INVALID' }, 401));
    const pending = startWithOneDeferredRetry(TOKEN);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    const failure = await pending.start.catch((error: unknown) => error);
    expect(failure).toMatchObject({ status: 401, code: 'GUEST_ACCESS_INVALID' });
    expect(isRetryableGuestAuthBootstrapFailure(failure)).toBe(false);
    const state = failedBootstrapState(TOKEN, true, failure, pending.stage());
    expect(state.token).toBeNull();
    expect(state.retryStage).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('keeps a rate-limited explicit context-switch intent and does not replay immediately', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(rateLimited('5'));
    const client = new GuestApiClient(TOKEN);
    const current = {
      token: TOKEN, client: GuestApiClient.browserSession(),
      contextConflictScope: 'ACTIVE' as const, isComplete: true,
      isContextSwitching: true, isSwitchOutcomeAmbiguous: false,
      isTemporarilyUnavailable: false, retryStage: null,
    };
    await expect(client.switchBrowserContext()).rejects.toMatchObject({ status: 429 });
    const state = failedGuestContextSwitchState(
      current,
      new GuestApiError({ status: 429, code: 'GUEST_ACCESS_RATE_LIMITED', message: 'Limited' }),
    );
    expect(state.token).toBe(TOKEN);
    expect(state.contextConflictScope).toBe('ACTIVE');
    expect(state.isSwitchOutcomeAmbiguous).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
