import { describe, expect, it } from 'vitest';
import { GuestApiError } from '../../lib/api/api-error';
import { classifyGuestReadFailure } from './guest-read-error-classification';

const failure = (status: number, code: string, isNetworkError = false) =>
  new GuestApiError({ status, code, message: 'safe', isNetworkError });

describe('Guest temporary read-error presentation', () => {
  it('keeps rate limits, service errors and network timeouts distinct', () => {
    expect(classifyGuestReadFailure(failure(429, 'GUEST_ACCESS_RATE_LIMITED')))
      .toBe('RATE_LIMITED');
    expect(classifyGuestReadFailure(failure(503, 'SERVICE_UNAVAILABLE')))
      .toBe('UNAVAILABLE');
    expect(classifyGuestReadFailure(failure(0, 'REQUEST_TIMEOUT', true)))
      .toBe('NETWORK');
    expect(classifyGuestReadFailure(failure(200, 'INVALID_RESPONSE')))
      .toBe('UNAVAILABLE');
  });

  it('never reclassifies unknown errors as valid state or terminal access', () => {
    expect(classifyGuestReadFailure(new Error('unexpected'))).toBe('UNKNOWN');
    expect(classifyGuestReadFailure(null)).toBeNull();
  });
});
