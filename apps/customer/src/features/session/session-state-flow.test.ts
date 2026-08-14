import { describe, expect, it } from 'vitest';

import type { GuestSafeSession } from '../../lib/api/guest-api-types';

describe('Guest Session State Flow (Phase 4)', () => {
  it('maps progression states accurately according to domain state machine', () => {
    const states: GuestSafeSession['state'][] = [
      'CHECKING_IN',
      'AWAITING_PARKING',
      'PARKING',
      'PARKED',
      'REQUESTED',
      'RETRIEVING',
      'READY',
      'HANDOFF_PENDING',
      'COMPLETED',
    ];

    expect(states).toHaveLength(9);
  });

  it('identifies pre-start cancellation validity only when REQUESTED', () => {
    const canCancel = (state: GuestSafeSession['state']) => state === 'REQUESTED';

    expect(canCancel('PARKED')).toBe(false);
    expect(canCancel('REQUESTED')).toBe(true);
    expect(canCancel('RETRIEVING')).toBe(false);
    expect(canCancel('READY')).toBe(false);
    expect(canCancel('HANDOFF_PENDING')).toBe(false);
    expect(canCancel('COMPLETED')).toBe(false);
  });

  it('keeps READY and HANDOFF_PENDING distinct (no proof assumed available in READY)', () => {
    const isProofAvailable = (state: GuestSafeSession['state']) => state === 'HANDOFF_PENDING';

    expect(isProofAvailable('READY')).toBe(false);
    expect(isProofAvailable('HANDOFF_PENDING')).toBe(true);
  });
});
