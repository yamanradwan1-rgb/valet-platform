import { describe, expect, it, vi } from 'vitest';
import { GuestApiError } from '../../lib/api/api-error';
import type { GuestApiClient } from '../../lib/api/guest-api-client';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import { GuestRequestCoordinator } from './guest-request-coordinator';
import { nextGuestReadDelay } from './guest-read-schedule';

const parked: GuestSafeSession = {
  valetSessionId: '123e4567-e89b-12d3-a456-426614174000',
  state: 'PARKED', readyAt: null,
  vehicle: { make: 'Toyota', model: 'Camry', color: 'White' },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((good, bad) => {
    resolve = good;
    reject = bad;
  });
  return { promise, resolve, reject };
}

function harness(loadSession: (signal?: AbortSignal) => Promise<GuestSafeSession>) {
  let time = 1_000;
  const accepted: GuestSafeSession[] = [];
  const client = { loadSession } as GuestApiClient;
  const coordinator = new GuestRequestCoordinator(
    client, () => {}, (session) => accepted.push(session), null, () => time,
  );
  return { coordinator, accepted, setTime: (next: number) => { time = next; } };
}

describe('GuestRequestCoordinator session/mutation ordering', () => {
  it('coalesces initial/manual/poll reads until the response body settles', async () => {
    const pending = deferred<GuestSafeSession>();
    const load = vi.fn(() => pending.promise);
    const { coordinator, accepted } = harness(load);
    const first = coordinator.read();
    const second = coordinator.read();
    const third = coordinator.read();
    expect(load).toHaveBeenCalledTimes(1);
    expect(coordinator.snapshot.isReading).toBe(true);
    pending.resolve(parked);
    await Promise.all([first, second, third]);
    expect(accepted).toEqual([parked]);
    expect(coordinator.snapshot.isReading).toBe(false);
    expect(coordinator.isFresh()).toBe(true);
  });

  it('fences GET PARKED when a later retrieval mutation yields REQUESTED', async () => {
    const oldPoll = deferred<GuestSafeSession>();
    const afterMutation = deferred<GuestSafeSession>();
    const load = vi.fn()
      .mockResolvedValueOnce(parked)
      .mockImplementationOnce(() => oldPoll.promise)
      .mockImplementationOnce(() => afterMutation.promise);
    const { coordinator, accepted } = harness(load);
    await coordinator.read();
    const poll = coordinator.read();
    const ticket = coordinator.beginMutation();
    expect(ticket).not.toBeNull();
    expect(coordinator.beginMutation()).toBeNull();
    const requested = { ...parked, state: 'REQUESTED' } as GuestSafeSession;
    const finishing = ticket!.finish(requested);
    oldPoll.resolve(parked);
    await poll;
    afterMutation.resolve(requested);
    await finishing;
    expect(coordinator.snapshot.session?.state).toBe('REQUESTED');
    expect(accepted.every((item, index) => index !== accepted.length - 1 || item.state === 'REQUESTED')).toBe(true);
    expect(load).toHaveBeenCalledTimes(3);
    expect(coordinator.isTrusted).toBe(true);
  });

  it('reconciles immediately after POST even if the cancelled old GET body hangs', async () => {
    const old = deferred<GuestSafeSession>();
    const newer = deferred<GuestSafeSession>();
    const requested = { ...parked, state: 'REQUESTED' } as GuestSafeSession;
    const load = vi.fn().mockResolvedValueOnce(parked)
      .mockImplementationOnce(() => old.promise)
      .mockImplementationOnce(() => newer.promise);
    const { coordinator } = harness(load);
    await coordinator.read();
    const staleRead = coordinator.read();
    const ticket = coordinator.beginMutation()!;
    const finish = ticket.finish(requested);
    expect(load).toHaveBeenCalledTimes(3);
    newer.resolve(requested);
    await finish;
    expect(coordinator.snapshot.session?.state).toBe('REQUESTED');
    old.resolve(parked);
    await staleRead;
    expect(coordinator.snapshot.session?.state).toBe('REQUESTED');
  });

  it('allows state to move back to PARKED after authorized cancel; no enum ranking', async () => {
    const requested = { ...parked, state: 'REQUESTED' } as GuestSafeSession;
    const load = vi.fn().mockResolvedValueOnce(requested).mockResolvedValueOnce(parked);
    const { coordinator } = harness(load);
    await coordinator.read();
    await coordinator.beginMutation()!.finish(parked);
    expect(coordinator.snapshot.session?.state).toBe('PARKED');
  });

  it('does not let old-client delayed fulfillment or failure resurrect a visit', async () => {
    const pending = deferred<GuestSafeSession>();
    const { coordinator, accepted } = harness(() => pending.promise);
    const read = coordinator.read();
    coordinator.dispose();
    pending.resolve(parked);
    await read;
    expect(accepted).toEqual([]);
    expect(coordinator.isTrusted).toBe(false);
  });

  it('clears authenticated material only for terminal invalid authority', async () => {
    const failure = new GuestApiError({ status: 401, code: 'GUEST_ACCESS_INVALID',
      message: 'Invalid guest access' });
    const load = vi.fn().mockResolvedValueOnce(parked).mockRejectedValueOnce(failure);
    const { coordinator } = harness(load);
    await coordinator.read();
    await coordinator.read();
    expect(coordinator.snapshot.isExpired).toBe(true);
    expect(coordinator.snapshot.session).toBeNull();
  });

  it('keeps last snapshot informational when 503 and applies Retry-After cooldown', async () => {
    const failure = new GuestApiError({ status: 503, code: 'SERVICE_UNAVAILABLE',
      message: 'Please retry', retryAfter: 42 });
    const load = vi.fn().mockResolvedValueOnce(parked).mockRejectedValueOnce(failure);
    const { coordinator, setTime } = harness(load);
    await coordinator.read();
    await coordinator.read();
    expect(coordinator.snapshot.session?.state).toBe('PARKED');
    expect(coordinator.isFresh()).toBe(false);
    expect(coordinator.snapshot.cooldownUntil).toBe(43_000);
    setTime(5_000);
    await coordinator.read();
    expect(load).toHaveBeenCalledTimes(2);
    setTime(43_001);
    expect(coordinator.isFresh()).toBe(false);
    expect(coordinator.beginMutation()).toBeNull();
  });

  it('blocks mutation from initial, stale or already-mutating authority', async () => {
    const { coordinator, setTime } = harness(async () => parked);
    expect(coordinator.beginMutation()).toBeNull();
    await coordinator.read();
    const ticket = coordinator.beginMutation();
    expect(ticket).not.toBeNull();
    expect(coordinator.beginMutation()).toBeNull();
    await ticket!.finish();
    setTime(200_000);
    expect(coordinator.beginMutation()).toBeNull();
  });

  it('does not overwrite current visit with unexpected GET identity', async () => {
    const foreign = { ...parked, valetSessionId: '987e4567-e89b-12d3-a456-426614174000' };
    const load = vi.fn().mockResolvedValueOnce(parked).mockResolvedValueOnce(foreign);
    const { coordinator } = harness(load);
    await coordinator.read();
    await coordinator.read();
    expect(coordinator.snapshot.session?.valetSessionId).toBe(parked.valetSessionId);
    expect(coordinator.snapshot.error).toBeInstanceOf(Error);
  });
});

describe('Guest polling schedule constraints', () => {
  it('honors approved 21-second ±1 second cadence and 35-second freshness', async () => {
    const { coordinator, setTime } = harness(async () => parked);
    expect(nextGuestReadDelay(coordinator.snapshot, 0, 0)).toBe(20_000);
    expect(nextGuestReadDelay(coordinator.snapshot, 0, 0.5)).toBe(21_000);
    expect(nextGuestReadDelay(coordinator.snapshot, 0, 1)).toBe(22_000);
    await coordinator.read();
    setTime(36_000);
    expect(coordinator.isFresh()).toBe(true);
    expect(coordinator.beginMutation()).not.toBeNull();
    const after = harness(async () => parked);
    await after.coordinator.read();
    after.setTime(36_001);
    expect(after.coordinator.isTrusted).toBe(false);
    expect(after.coordinator.beginMutation()).toBeNull();
  });

  it('fits worst-case two-tab 900-second rolling compatibility envelope', () => {
    // One shared Browser Session credential: both tabs, all additional A/B/C/D
    // presentations, jitter minimum 20s and worst-case sliding boundaries.
    const windowMs = 900_000;
    const events: number[] = [];
    for (let tab = 0; tab < 2; tab += 1) {
      for (let time = tab * 1_000; time < windowMs * 3; time += 20_000) {
        events.push(time);
      }
    }
    // 66 additional presentations as documented by Owner (initial/wake/manual,
    // projections + lifecycle/operation/proof), all concentrated in one window.
    for (let i = 0; i < 66; i += 1) events.push(450_000 + i);
    const sorted = events.sort((a, b) => a - b);
    let first = 0;
    let max = 0;
    for (let last = 0; last < sorted.length; last += 1) {
      while (sorted[last]! - sorted[first]! >= windowMs) first += 1;
      max = Math.max(max, last - first + 1);
    }
    expect(max).toBeLessThanOrEqual(180);
    expect(180 - max).toBeGreaterThanOrEqual(22);
  });

  it('uses bounded jitter and never retries before a server cooldown', async () => {
    const { coordinator } = harness(async () => parked);
    const state = { ...coordinator.snapshot, failures: 4, cooldownUntil: 900_000 };
    expect(nextGuestReadDelay(state, 0, 0)).toBe(900_000);
    expect(nextGuestReadDelay({ ...state, cooldownUntil: 0 }, 0, 1)).toBe(31_000);
  });
});
