import { describe, expect, it } from 'vitest';

import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import {
  createGuestReadyAlertTracker,
  observeGuestReadySnapshot,
} from './guest-ready-alert-tracker';

const SESSION_A = '11111111-1111-4111-8111-111111111111';
const SESSION_B = '22222222-2222-4222-8222-222222222222';
const READY_AT = '2026-08-29T20:00:00.000Z';

function session(
  state: GuestSafeSession['state'],
  readyAt: string | null,
  valetSessionId = SESSION_A,
  notificationEnabled?: boolean,
): GuestSafeSession {
  return {
    ...(notificationEnabled === undefined
      ? {}
      : { guestVehicleReadyNotificationEnabled: notificationEnabled }),
    readyAt,
    state,
    valetSessionId,
    vehicle: { color: null, make: 'Toyota', model: 'Camry' },
  };
}

describe('Guest vehicle-ready presentation tracking', () => {
  it.each([
    session('RETRIEVING', null),
    session('READY', READY_AT),
  ])('treats initialSession as an already-observed baseline', (initial) => {
    const tracker = createGuestReadyAlertTracker(initial);
    expect(observeGuestReadySnapshot(tracker, initial)).toEqual({ kind: 'NONE' });
  });

  it.each([
    session('RETRIEVING', null),
    session('READY', READY_AT),
    session('HANDOFF_PENDING', READY_AT),
  ])('baselines the initial authorized snapshot without presentation', (initial) => {
    const tracker = createGuestReadyAlertTracker(null);
    expect(observeGuestReadySnapshot(tracker, initial)).toEqual({
      kind: 'BASELINE',
    });
  });

  it('presents one later null-to-readyAt transition and never replays it', () => {
    const tracker = createGuestReadyAlertTracker(session('RETRIEVING', null));
    const ready = session('READY', READY_AT);
    expect(observeGuestReadySnapshot(tracker, ready)).toEqual({
      identity: `${SESSION_A}:${READY_AT}`,
      kind: 'PRESENT',
    });
    expect(observeGuestReadySnapshot(tracker, ready)).toEqual({ kind: 'NONE' });
    expect(observeGuestReadySnapshot(tracker, ready)).toEqual({ kind: 'NONE' });
  });

  it('recovers a skipped READY snapshot from HANDOFF_PENDING exactly once', () => {
    const tracker = createGuestReadyAlertTracker(session('RETRIEVING', null));
    expect(
      observeGuestReadySnapshot(tracker, session('HANDOFF_PENDING', READY_AT)),
    ).toMatchObject({ kind: 'PRESENT' });
    expect(
      observeGuestReadySnapshot(tracker, session('READY', READY_AT)),
    ).toEqual({ kind: 'NONE' });
  });

  it('records but suppresses a newly observed identity on COMPLETED', () => {
    const tracker = createGuestReadyAlertTracker(session('RETRIEVING', null));
    expect(
      observeGuestReadySnapshot(tracker, session('COMPLETED', READY_AT)),
    ).toEqual({
      identity: `${SESSION_A}:${READY_AT}`,
      kind: 'SUPPRESS_COMPLETED',
    });
    expect(
      observeGuestReadySnapshot(tracker, session('READY', READY_AT)),
    ).toEqual({ kind: 'NONE' });
  });

  it('records a policy-disabled READY identity and never replays it after re-enable', () => {
    const tracker = createGuestReadyAlertTracker(session('RETRIEVING', null));
    expect(
      observeGuestReadySnapshot(
        tracker,
        session('READY', READY_AT, SESSION_A, false),
      ),
    ).toEqual({ kind: 'NONE' });
    expect(
      observeGuestReadySnapshot(
        tracker,
        session('READY', READY_AT, SESSION_A, true),
      ),
    ).toEqual({ kind: 'NONE' });
    expect(tracker.observedIdentities.has(`${SESSION_A}:${READY_AT}`)).toBe(true);
  });

  it.each(['READY', 'HANDOFF_PENDING', 'COMPLETED'] as const)(
    'does not replay during later %s progression with the same identity',
    (state) => {
      const tracker = createGuestReadyAlertTracker(session('RETRIEVING', null));
      observeGuestReadySnapshot(tracker, session('READY', READY_AT));
      expect(observeGuestReadySnapshot(tracker, session(state, READY_AT))).toEqual({
        kind: 'NONE',
      });
    },
  );

  it('resets on a different ValetSession and baselines its existing READY identity', () => {
    const tracker = createGuestReadyAlertTracker(session('RETRIEVING', null));
    observeGuestReadySnapshot(tracker, session('READY', READY_AT));
    expect(
      observeGuestReadySnapshot(
        tracker,
        session('READY', '2026-08-29T21:00:00.000Z', SESSION_B),
      ),
    ).toEqual({ kind: 'BASELINE' });
  });
});
