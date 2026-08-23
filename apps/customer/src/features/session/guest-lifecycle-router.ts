import type { GuestSafeSession } from '../../lib/api/guest-api-types';

export type GuestScreenId =
  | 'UNAVAILABLE'
  | 'LOADING'
  | 'NETWORK_ERROR'
  | 'RECEIVED'
  | 'PARKED'
  | 'REQUESTED'
  | 'RETRIEVING'
  | 'READY'
  | 'HANDOFF_PENDING_PIN'
  | 'HANDOFF_PENDING_QR'
  | 'COMPLETED';

export interface RouteResolutionInput {
  readonly hasToken: boolean;
  readonly isTokenBootstrapComplete?: boolean;
  readonly isExpired: boolean;
  readonly isNetworkError: boolean;
  readonly isLoading: boolean;
  readonly session: GuestSafeSession | null;
  readonly handoffMethod?: 'PICKUP_CODE' | 'DYNAMIC_QR' | undefined;
}

export function resolveGuestScreenId(input: RouteResolutionInput): GuestScreenId {
  if (input.isTokenBootstrapComplete === false) {
    return 'LOADING';
  }

  // If no guest token or session expired, render safe unavailable screen
  if (!input.hasToken || input.isExpired) {
    return 'UNAVAILABLE';
  }

  // Network error before any session loaded
  if (input.isNetworkError && !input.session) {
    return 'NETWORK_ERROR';
  }

  // Initial loading
  if (input.isLoading && !input.session) {
    return 'LOADING';
  }

  // No authoritative session
  if (!input.session) {
    return 'UNAVAILABLE';
  }

  switch (input.session.state) {
    case 'CHECKING_IN':
    case 'AWAITING_PARKING':
    case 'PARKING':
      return 'RECEIVED';
    case 'PARKED':
      return 'PARKED';
    case 'REQUESTED':
      return 'REQUESTED';
    case 'RETRIEVING':
      return 'RETRIEVING';
    case 'READY':
      return 'READY';
    case 'HANDOFF_PENDING':
      return input.handoffMethod === 'DYNAMIC_QR'
        ? 'HANDOFF_PENDING_QR'
        : 'HANDOFF_PENDING_PIN';
    case 'COMPLETED':
      return 'COMPLETED';
    default:
      return 'UNAVAILABLE';
  }
}
