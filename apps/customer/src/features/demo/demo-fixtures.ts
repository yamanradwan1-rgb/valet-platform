import type { GuestSafeSession } from '../../lib/api/guest-api-types';

export type DemoSessionKey =
  | 'received'
  | 'parked'
  | 'requested'
  | 'retrieving'
  | 'ready'
  | 'handoff_pending'
  | 'completed';

export const demoSessions: Record<DemoSessionKey, GuestSafeSession> = {
  received: {
    readyAt: null,
    valetSessionId: '11111111-1111-4111-8111-111111111111',
    state: 'CHECKING_IN',
    vehicle: {
      make: 'Porsche',
      model: 'Taycan 4S',
      color: 'Frozen Blue',
    },
  },
  parked: {
    readyAt: null,
    valetSessionId: '22222222-2222-4222-8222-222222222222',
    state: 'PARKED',
    vehicle: {
      make: 'Porsche',
      model: 'Taycan 4S',
      color: 'Frozen Blue',
    },
  },
  requested: {
    readyAt: null,
    valetSessionId: '33333333-3333-4333-8333-333333333333',
    state: 'REQUESTED',
    vehicle: {
      make: 'Porsche',
      model: 'Taycan 4S',
      color: 'Frozen Blue',
    },
  },
  retrieving: {
    readyAt: null,
    valetSessionId: '44444444-4444-4444-8444-444444444444',
    state: 'RETRIEVING',
    vehicle: {
      make: 'Porsche',
      model: 'Taycan 4S',
      color: 'Frozen Blue',
    },
  },
  ready: {
    readyAt: '2026-08-29T12:00:00.000Z',
    valetSessionId: '55555555-5555-4555-8555-555555555555',
    state: 'READY',
    vehicle: {
      make: 'Porsche',
      model: 'Taycan 4S',
      color: 'Frozen Blue',
    },
  },
  handoff_pending: {
    readyAt: '2026-08-29T12:00:00.000Z',
    valetSessionId: '66666666-6666-4666-8666-666666666666',
    state: 'HANDOFF_PENDING',
    vehicle: {
      make: 'Porsche',
      model: 'Taycan 4S',
      color: 'Frozen Blue',
    },
  },
  completed: {
    readyAt: '2026-08-29T12:00:00.000Z',
    valetSessionId: '77777777-7777-4777-8777-777777777777',
    state: 'COMPLETED',
    vehicle: {
      make: 'Porsche',
      model: 'Taycan 4S',
      color: 'Frozen Blue',
    },
  },
};
