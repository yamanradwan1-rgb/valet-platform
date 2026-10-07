import { describe, expect, it } from 'vitest';

import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import { resolveGuestScreenId } from './guest-lifecycle-router';

const parkingSession: GuestSafeSession = {
  readyAt: null,
  valetSessionId: 'f93d3d2e-94d8-41c8-b54e-98ddc0e3c8c9',
  state: 'PARKING',
  vehicle: { make: 'Toyota', model: 'Camry', color: 'White' },
};

describe('Guest bootstrap lifecycle', () => {
  it('stays loading while browser token acquisition is unresolved', () => {
    expect(
      resolveGuestScreenId({
        hasAuthority: false,
        isTokenBootstrapComplete: false,
        isExpired: false,
        isNetworkError: false,
        isLoading: false,
        session: null,
      }),
    ).toBe('LOADING');
  });

  it('stays loading after token acquisition while the session request is pending', () => {
    expect(
      resolveGuestScreenId({
        hasAuthority: true,
        isTokenBootstrapComplete: true,
        isExpired: false,
        isNetworkError: false,
        isLoading: true,
        session: null,
      }),
    ).toBe('LOADING');
  });

  it('routes an authoritative PARKING session to the received state', () => {
    expect(
      resolveGuestScreenId({
        hasAuthority: true,
        isTokenBootstrapComplete: true,
        isExpired: false,
        isNetworkError: false,
        isLoading: false,
        session: parkingSession,
      }),
    ).toBe('RECEIVED');
  });

  it('becomes unavailable only after bootstrap completes without a token', () => {
    expect(
      resolveGuestScreenId({
        hasAuthority: false,
        isTokenBootstrapComplete: true,
        isExpired: false,
        isNetworkError: false,
        isLoading: false,
        session: null,
      }),
    ).toBe('UNAVAILABLE');
  });

  it('routes a temporary auth bootstrap transport failure to the existing network state', () => {
    expect(
      resolveGuestScreenId({
        hasAuthority: false,
        isTokenBootstrapComplete: true,
        isAuthBootstrapUnavailable: true,
        isExpired: false,
        isNetworkError: false,
        isLoading: false,
        session: null,
      }),
    ).toBe('NETWORK_ERROR');
  });
});
