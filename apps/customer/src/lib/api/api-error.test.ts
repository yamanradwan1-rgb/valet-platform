import { describe, expect, it } from 'vitest';

import { mapToGuestSafeMessage } from './api-error';

describe('mapToGuestSafeMessage', () => {
  it('maps known error codes to safe user-friendly strings', () => {
    const res1 = mapToGuestSafeMessage(401, { code: 'GUEST_ACCESS_INVALID' });
    expect(res1.code).toBe('GUEST_ACCESS_INVALID');
    expect(res1.message).toBe('This valet session link is invalid or has expired.');

    const res2 = mapToGuestSafeMessage(429, { code: 'GUEST_ACCESS_RATE_LIMITED', retryAfter: 30 });
    expect(res2.code).toBe('GUEST_ACCESS_RATE_LIMITED');
    expect(res2.retryAfter).toBe(30);

    const res3 = mapToGuestSafeMessage(409, { code: 'INVALID_STATE_TRANSITION' });
    expect(res3.code).toBe('INVALID_STATE_TRANSITION');
    expect(res3.message).toBe('Unable to perform this action for the vehicle’s current state.');
  });

  it('maps generic status codes when no structured code is provided', () => {
    const res401 = mapToGuestSafeMessage(401, null);
    expect(res401.code).toBe('GUEST_ACCESS_INVALID');

    const res429 = mapToGuestSafeMessage(429, null);
    expect(res429.code).toBe('GUEST_ACCESS_RATE_LIMITED');

    const res500 = mapToGuestSafeMessage(500, 'Internal Server Error');
    expect(res500.code).toBe('SERVICE_UNAVAILABLE');
    expect(res500.message).toContain('temporarily unavailable');
  });
});
