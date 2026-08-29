import { describe, expect, it, vi } from 'vitest';

import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import { GuestApiClient } from '../../lib/api/guest-api-client';
import { resolveGuestScreenId } from './guest-lifecycle-router';

const mockSessionBase: GuestSafeSession = {
  readyAt: null,
  valetSessionId: '123e4567-e89b-12d3-a456-426614174000',
  state: 'PARKED',
  vehicle: {
    make: 'Porsche',
    model: '911 GT3',
    color: 'Silver',
  },
};

describe('Authoritative Guest State Machine & Production Router', () => {
  it('maps all authoritative backend states to the exact matching screens', () => {
    // Check-in states -> RECEIVED
    expect(
      resolveGuestScreenId({
        hasToken: true,
        isExpired: false,
        isNetworkError: false,
        isLoading: false,
        session: { ...mockSessionBase, state: 'CHECKING_IN' },
      }),
    ).toBe('RECEIVED');

    expect(
      resolveGuestScreenId({
        hasToken: true,
        isExpired: false,
        isNetworkError: false,
        isLoading: false,
        session: { ...mockSessionBase, state: 'AWAITING_PARKING' },
      }),
    ).toBe('RECEIVED');

    expect(
      resolveGuestScreenId({
        hasToken: true,
        isExpired: false,
        isNetworkError: false,
        isLoading: false,
        session: { ...mockSessionBase, state: 'PARKING' },
      }),
    ).toBe('RECEIVED');

    // PARKED -> PARKED
    expect(
      resolveGuestScreenId({
        hasToken: true,
        isExpired: false,
        isNetworkError: false,
        isLoading: false,
        session: { ...mockSessionBase, state: 'PARKED' },
      }),
    ).toBe('PARKED');

    // REQUESTED -> REQUESTED
    expect(
      resolveGuestScreenId({
        hasToken: true,
        isExpired: false,
        isNetworkError: false,
        isLoading: false,
        session: { ...mockSessionBase, state: 'REQUESTED' },
      }),
    ).toBe('REQUESTED');

    // RETRIEVING -> RETRIEVING
    expect(
      resolveGuestScreenId({
        hasToken: true,
        isExpired: false,
        isNetworkError: false,
        isLoading: false,
        session: { ...mockSessionBase, state: 'RETRIEVING' },
      }),
    ).toBe('RETRIEVING');

    // READY -> READY (never renders handoff proof)
    expect(
      resolveGuestScreenId({
        hasToken: true,
        isExpired: false,
        isNetworkError: false,
        isLoading: false,
        session: { ...mockSessionBase, state: 'READY' },
      }),
    ).toBe('READY');

    // HANDOFF_PENDING -> PIN or QR depending on active method
    expect(
      resolveGuestScreenId({
        hasToken: true,
        isExpired: false,
        isNetworkError: false,
        isLoading: false,
        session: { ...mockSessionBase, state: 'HANDOFF_PENDING' },
        handoffMethod: 'PICKUP_CODE',
      }),
    ).toBe('HANDOFF_PENDING_PIN');

    expect(
      resolveGuestScreenId({
        hasToken: true,
        isExpired: false,
        isNetworkError: false,
        isLoading: false,
        session: { ...mockSessionBase, state: 'HANDOFF_PENDING' },
        handoffMethod: 'DYNAMIC_QR',
      }),
    ).toBe('HANDOFF_PENDING_QR');

    // COMPLETED -> COMPLETED (terminal)
    expect(
      resolveGuestScreenId({
        hasToken: true,
        isExpired: false,
        isNetworkError: false,
        isLoading: false,
        session: { ...mockSessionBase, state: 'COMPLETED' },
      }),
    ).toBe('COMPLETED');
  });

  it('never renders a session when no guest credential exists or session is expired', () => {
    // No token -> UNAVAILABLE
    expect(
      resolveGuestScreenId({
        hasToken: false,
        isExpired: false,
        isNetworkError: false,
        isLoading: false,
        session: null,
      }),
    ).toBe('UNAVAILABLE');

    // Expired -> UNAVAILABLE
    expect(
      resolveGuestScreenId({
        hasToken: true,
        isExpired: true,
        isNetworkError: false,
        isLoading: false,
        session: mockSessionBase,
      }),
    ).toBe('UNAVAILABLE');

    // Null session when not loading -> UNAVAILABLE
    expect(
      resolveGuestScreenId({
        hasToken: true,
        isExpired: false,
        isNetworkError: false,
        isLoading: false,
        session: null,
      }),
    ).toBe('UNAVAILABLE');
  });

  it('READY state strictly cannot render handoff proof screens', () => {
    const screen = resolveGuestScreenId({
      hasToken: true,
      isExpired: false,
      isNetworkError: false,
      isLoading: false,
      session: { ...mockSessionBase, state: 'READY' },
      handoffMethod: 'PICKUP_CODE',
    });
    expect(screen).toBe('READY');
    expect(screen).not.toBe('HANDOFF_PENDING_PIN');
    expect(screen).not.toBe('HANDOFF_PENDING_QR');
  });

  it('REQUESTED cancellation sends authoritative command with empty body and bearer', async () => {
    const mockReturnedSession: GuestSafeSession = {
      ...mockSessionBase,
      state: 'PARKED',
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockReturnedSession),
    } as Response);

    const client = new GuestApiClient('test-token', 'http://localhost:3002/api/v1/guest');
    const result = await client.cancelRetrieval();
    expect(result.state).toBe('PARKED');
    expect(result.valetSessionId).toBe('123e4567-e89b-12d3-a456-426614174000');

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/guest/session/cancel-retrieval'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
        body: JSON.stringify({}),
      }),
    );

    fetchSpy.mockRestore();
  });
});
