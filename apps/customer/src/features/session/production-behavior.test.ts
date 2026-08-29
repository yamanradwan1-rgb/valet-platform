import { describe, expect, it, vi } from 'vitest';

import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import { GuestApiClient } from '../../lib/api/guest-api-client';
import { resolveGuestScreenId } from './guest-lifecycle-router';

const mockSession: GuestSafeSession = {
  readyAt: null,
  valetSessionId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  state: 'PARKED',
  vehicle: {
    make: 'BMW',
    model: 'M3',
    color: 'Green',
  },
};

describe('Production Guest UI Invariants and Security Behavior', () => {
  it('PARKED retrieval request calls API with empty body and bearer (server-derived authority)', async () => {
    const updatedSession: GuestSafeSession = {
      ...mockSession,
      state: 'REQUESTED',
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(updatedSession),
    } as Response);

    const client = new GuestApiClient('prod-token-abc', 'http://localhost:3002/api/v1/guest');
    const result = await client.requestRetrieval();
    expect(result.state).toBe('REQUESTED');
    expect(result.valetSessionId).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/guest/session/request-retrieval'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer prod-token-abc',
        }),
        body: JSON.stringify({}),
      }),
    );

    fetchSpy.mockRestore();
  });

  it('HANDOFF_PENDING routes correctly for real Pickup Code material and Dynamic QR payloads', async () => {
    // 1. PIN handoff route
    const pinScreen = resolveGuestScreenId({
      hasToken: true,
      isExpired: false,
      isNetworkError: false,
      isLoading: false,
      session: { ...mockSession, state: 'HANDOFF_PENDING' },
      handoffMethod: 'PICKUP_CODE',
    });
    expect(pinScreen).toBe('HANDOFF_PENDING_PIN');

    // 2. Dynamic QR route
    const qrScreen = resolveGuestScreenId({
      hasToken: true,
      isExpired: false,
      isNetworkError: false,
      isLoading: false,
      session: { ...mockSession, state: 'HANDOFF_PENDING' },
      handoffMethod: 'DYNAMIC_QR',
    });
    expect(qrScreen).toBe('HANDOFF_PENDING_QR');

    // 3. Verify issue API call provides real handoff material
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          valetSessionId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          state: 'HANDOFF_PENDING',
          method: 'PICKUP_CODE',
          pickupCode: '9182',
          expiresAt: '2026-08-14T01:00:00.000Z',
        }),
    } as Response);

    const client = new GuestApiClient('prod-token-abc', 'http://localhost:3002/api/v1/guest');
    const material = await client.issueHandoff('PICKUP_CODE');
    expect(material.method).toBe('PICKUP_CODE');
    if (material.method === 'PICKUP_CODE') {
      expect(material.pickupCode).toBe('9182');
    }

    fetchSpy.mockRestore();
  });

  it('COMPLETED state is terminal and routes to COMPLETED screen without fallback', () => {
    const screen = resolveGuestScreenId({
      hasToken: true,
      isExpired: false,
      isNetworkError: false,
      isLoading: false,
      session: { ...mockSession, state: 'COMPLETED' },
    });
    expect(screen).toBe('COMPLETED');
  });

  it('verifies demo UI cannot run when no valid credentials exist in live mode', () => {
    const unauthenticatedScreen = resolveGuestScreenId({
      hasToken: false,
      isExpired: false,
      isNetworkError: false,
      isLoading: false,
      session: null,
    });
    expect(unauthenticatedScreen).toBe('UNAVAILABLE');
    expect(unauthenticatedScreen).not.toBe('PARKED');
    expect(unauthenticatedScreen).not.toBe('RECEIVED');
  });
});
