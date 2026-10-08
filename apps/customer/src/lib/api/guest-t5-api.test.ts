import { afterEach, describe, expect, it, vi } from 'vitest';

import { GuestApiClient } from './guest-api-client';
import type { GuestSafeSession } from './guest-api-types';

const base = 'http://test-server/api/v1/guest';
const visitId = '123e4567-e89b-12d3-a456-426614174000';
const session: GuestSafeSession = {
  valetSessionId: visitId,
  state: 'COMPLETED',
  readyAt: '2026-10-08T12:00:00.000Z',
  vehicle: { make: 'Toyota', model: 'Prius', color: null },
};

const rating = {
  rating: 4,
  ratedAt: '2026-10-08T12:01:00.000Z',
  valetSessionId: visitId,
};

const payment = {
  releaseRequiresPayment: false,
  releaseSatisfied: true,
  payment: null,
  refunds: [],
};

afterEach(() => vi.restoreAllMocks());

describe('T5 real Guest rating transport', () => {
  it('posts exactly one 1–5 rating through cookie/CSRF authority', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(rating), { status: 200 }),
    );
    const client = GuestApiClient.browserSession(base);

    expect(await client.submitRating(4)).toEqual(rating);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(`${base}/session/rating`,
      expect.objectContaining({
        method: 'POST', cache: 'no-store', credentials: 'same-origin',
        body: '{"rating":4}',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-vaylet-guest-session': 'v1',
        },
      }),
    );
  });

  it.each([0, 6, -1, 1.25, NaN, Infinity])('rejects invalid rating %s before transport', async (bad) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(GuestApiClient.browserSession(base).submitRating(bad)).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not replay a lost-response rating POST', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Lost'));
    await expect(GuestApiClient.browserSession(base).submitRating(4)).rejects.toMatchObject({
      code: 'MUTATION_OUTCOME_UNKNOWN',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    'GUEST_RATING_CONFLICT', 'GUEST_RATING_NOT_AVAILABLE',
  ])('preserves distinct 409 rating error %s without showing success', async (code) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ code }), { status: 409 }),
    );
    await expect(GuestApiClient.browserSession(base).submitRating(3)).rejects.toMatchObject({
      status: 409, code,
    });
  });

  it('rejects an invalid success body instead of displaying submitted state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ rating: 4 }), { status: 200 }),
    );
    await expect(GuestApiClient.browserSession(base).submitRating(4)).rejects.toMatchObject({
      code: 'MUTATION_OUTCOME_UNKNOWN',
    });
  });
});

describe('T5 narrow authorized financial projection transport', () => {
  it('GETs only canonical visit path, with no-store, cookie authority and no mutations', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(payment), { status: 200 }),
    );
    expect(await GuestApiClient.browserSession(base).loadPaymentProjection(session)).toEqual(payment);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(`${base}/valet-sessions/${visitId}/payment`,
      expect.objectContaining({
        method: 'GET', cache: 'no-store', credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      }),
    );
  });

  it('rejects injected provider/internal payment fields and does not claim a receipt', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ...payment, providerSecret: 'not-safe' }), { status: 200 }),
    );
    await expect(GuestApiClient.browserSession(base).loadPaymentProjection(session)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('preserves failure of a wrong-visit request, no fallback to current data', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'GUEST_ACCESS_INVALID' }), { status: 401 }),
    );
    await expect(GuestApiClient.browserSession(base).loadPaymentProjection(session)).rejects.toMatchObject({
      code: 'GUEST_ACCESS_INVALID',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
