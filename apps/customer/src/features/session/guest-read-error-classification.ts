import { GuestApiError } from '../../lib/api/api-error';

export type GuestReadFailureKind = 'NETWORK' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'UNKNOWN' | null;

export function classifyGuestReadFailure(error: unknown): GuestReadFailureKind {
  if (!error) return null;
  if (!(error instanceof GuestApiError)) return 'UNKNOWN';
  if (error.status === 429 || error.code === 'GUEST_ACCESS_RATE_LIMITED') return 'RATE_LIMITED';
  if (error.code === 'NETWORK_ERROR' || error.code === 'REQUEST_TIMEOUT' || error.isNetworkError) {
    return 'NETWORK';
  }
  if (error.status >= 500 || error.code === 'SERVICE_UNAVAILABLE' ||
      error.code === 'ANTI_ABUSE_UNAVAILABLE' || error.code === 'INVALID_RESPONSE') {
    return 'UNAVAILABLE';
  }
  return 'UNKNOWN';
}
