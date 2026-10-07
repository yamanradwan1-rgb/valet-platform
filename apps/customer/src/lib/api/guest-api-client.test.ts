import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GuestApiClient } from './guest-api-client';
import { GuestApiError } from './api-error';

describe('GuestApiClient', () => {
  const token = 'guest-test-bearer-token-12345';
  const customBaseUrl = 'http://test-server/api/v1/guest';
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';
  let client: GuestApiClient;

  beforeEach(() => {
    client = new GuestApiClient(token, customBaseUrl);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends Authorization header and no-store cache control on loadSession', async () => {
    const mockSession = {
      readyAt: null,
      valetSessionId: validUuid,
      state: 'PARKED',
      vehicle: {
        make: 'Porsche',
        model: 'Taycan',
        color: 'Blue',
      },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockSession), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await client.loadSession();

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://test-server/api/v1/guest/session',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }),
    );
    expect(result.valetSessionId).toBe(validUuid);
    expect(result.state).toBe('PARKED');
  });

  it('sends POST with empty JSON body for requestRetrieval', async () => {
    const mockSession = {
      readyAt: null,
      valetSessionId: validUuid,
      state: 'REQUESTED',
      vehicle: { make: 'Porsche', model: 'Taycan', color: 'Blue' },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockSession), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await client.requestRetrieval();

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://test-server/api/v1/guest/session/request-retrieval',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      }),
    );
    expect(result.state).toBe('REQUESTED');
  });

  it('sends POST with empty JSON body for cancelRetrieval (DEC-044)', async () => {
    const mockSession = {
      readyAt: null,
      valetSessionId: validUuid,
      state: 'PARKED',
      vehicle: { make: 'Porsche', model: 'Taycan', color: 'Blue' },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockSession), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await client.cancelRetrieval();

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://test-server/api/v1/guest/session/cancel-retrieval',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      }),
    );
    expect(result.state).toBe('PARKED');
  });

  it('sends POST with method for issueHandoff and rotateHandoff (DEC-042)', async () => {
    const mockHandoff = {
      valetSessionId: validUuid,
      state: 'HANDOFF_PENDING',
      method: 'PICKUP_CODE',
      pickupCode: '4821',
      expiresAt: '2026-08-14T05:00:00.000Z',
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockHandoff), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await client.issueHandoff('PICKUP_CODE');

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://test-server/api/v1/guest/session/handoff-verification/issue',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ method: 'PICKUP_CODE' }),
      }),
    );
    expect(result.method).toBe('PICKUP_CODE');
    if (result.method === 'PICKUP_CODE') {
      expect(result.pickupCode).toBe('4821');
    }
  });

  it('maps 401 GUEST_ACCESS_INVALID to user-safe message without token leakage', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ code: 'GUEST_ACCESS_INVALID', message: 'Token expired' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    try {
      await client.loadSession();
      expect.unreachable('Should have thrown GuestApiError');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(GuestApiError);
      const apiErr = err as GuestApiError;
      expect(apiErr.code).toBe('GUEST_ACCESS_INVALID');
      expect(apiErr.message).toContain('invalid or has expired');
      expect(apiErr.message).not.toContain(token);
    }
  });

  it('handles network failure with isNetworkError flag', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));

    try {
      await client.loadSession();
      expect.unreachable('Should have thrown GuestApiError');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(GuestApiError);
      const apiErr = err as GuestApiError;
      expect(apiErr.isNetworkError).toBe(true);
      expect(apiErr.code).toBe('NETWORK_ERROR');
    }
  });

  it('enrolls without Authorization and exchanges with the bootstrap bearer', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await client.enrollBrowserSession();
    await client.exchangeBrowserSession();

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'http://test-server/api/v1/guest/browser-session/enroll',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: '{}',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-vaylet-guest-session': 'v1',
        },
      }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'http://test-server/api/v1/guest/browser-session/exchange',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: '{}',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-vaylet-guest-session': 'v1',
        },
      }),
    );
  });

  it('uses cookie authority without Authorization and fences cookie mutations with CSRF', async () => {
    const cookieClient = GuestApiClient.browserSession(customBaseUrl);
    const session = {
      readyAt: null,
      valetSessionId: validUuid,
      state: 'PARKED',
      vehicle: { make: 'Porsche', model: 'Taycan', color: 'Blue' },
    };
    const requested = { ...session, state: 'REQUESTED' };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(session), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(requested), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    await cookieClient.loadSession();
    await cookieClient.requestRetrieval();

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'http://test-server/api/v1/guest/session',
      expect.objectContaining({
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'http://test-server/api/v1/guest/session/request-retrieval',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: '{}',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-vaylet-guest-session': 'v1',
        },
      }),
    );
  });
});
