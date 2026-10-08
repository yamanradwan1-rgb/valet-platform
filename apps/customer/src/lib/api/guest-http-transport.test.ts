import { afterEach, describe, expect, it, vi } from 'vitest';
import { GuestApiError } from './api-error';
import { GuestApiClient } from './guest-api-client';
import { parseGuestRetryAfter } from './guest-http-transport';

const uuid = '123e4567-e89b-12d3-a456-426614174000';
const parked = { valetSessionId: uuid, state: 'PARKED', readyAt: null,
  vehicle: { make: 'Toyota', model: 'Camry', color: 'White' } };

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Guest HTTP deadlines and error semantics', () => {
  it('ends a GET even when fetch ignores AbortSignal and headers never arrive', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    const attempt = GuestApiClient.browserSession().loadSession();
    const check = expect(attempt).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(8_000);
    await check;
  });

  it('ends a GET if response body hangs after response headers', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200, text: () => new Promise(() => {}),
    } as unknown as Response);
    const attempt = GuestApiClient.browserSession().loadSession();
    const check = expect(attempt).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(8_000);
    await check;
  });

  it('treats POST timeout as unknown outcome, never a proven failure', async () => {
    vi.useFakeTimers();
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    const attempt = new GuestApiClient('test').requestRetrieval();
    const check = expect(attempt).rejects.toMatchObject({ code: 'MUTATION_OUTCOME_UNKNOWN' });
    await vi.advanceTimersByTimeAsync(12_000);
    await check;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('recognizes invalid success JSON/schema instead of authenticating imaginary data', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('{not-json', { status: 200 }),
    ).mockResolvedValueOnce(new Response(JSON.stringify({ fake: true }), { status: 200 }));
    const client = new GuestApiClient('test');
    await expect(client.loadSession()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(client.loadSession()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('preserves successful schema parsing within the guarded transport', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(parked)));
    expect((await new GuestApiClient('test').loadSession()).state).toBe('PARKED');
  });

  it('parses integer seconds or RFC HTTP-date with safe fallback', () => {
    const now = Date.parse('2026-10-08T12:00:00Z');
    expect(parseGuestRetryAfter('60', 5, now)).toBe(60);
    expect(parseGuestRetryAfter('Thu, 08 Oct 2026 12:01:30 GMT', 5, now)).toBe(90);
    expect(parseGuestRetryAfter('Thu, 08 Oct 2026 11:00:00 GMT', 5, now)).toBe(0);
    expect(parseGuestRetryAfter('-2', 5, now)).toBe(5);
    expect(parseGuestRetryAfter('0.5', 7, now)).toBe(7);
    expect(parseGuestRetryAfter('nonsense', undefined, now)).toBeUndefined();
    expect(parseGuestRetryAfter('99999999999999999999', 12, now)).toBe(12);
  });

  it('uses server Retry-After headers on HTTP 429 without exposing server messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({ code: 'GUEST_ACCESS_RATE_LIMITED', message: 'private backend context', retryAfter: 3 }),
      { status: 429, headers: { 'Retry-After': '49' } },
    ));
    let failure: unknown;
    try { await new GuestApiClient('test').loadSession(); }
    catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(GuestApiError);
    expect(failure).toMatchObject({ code: 'GUEST_ACCESS_RATE_LIMITED', retryAfter: 49 });
    expect((failure as Error).message).not.toContain('private backend');
  });

  it('distinguishes cancelled reads and keeps authorization errors terminal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(new GuestApiClient('test').loadSession(controller.signal))
      .rejects.toMatchObject({ code: 'GUEST_REQUEST_CANCELLED' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ code: 'GUEST_ACCESS_INVALID' }), { status: 401 },
    ));
    await expect(new GuestApiClient('test').loadSession())
      .rejects.toMatchObject({ code: 'GUEST_ACCESS_INVALID' });
  });
});
