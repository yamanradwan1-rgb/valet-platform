import { describe, expect, it, vi } from 'vitest';

import { GuestApiError } from '../../lib/api/api-error';
import type { GuestApiClient } from '../../lib/api/guest-api-client';
import { GuestRatingSubmission, type RatingOutcome } from './guest-rating-submission';

const visit = '123e4567-e89b-12d3-a456-426614174000';
const otherVisit = '123e4567-e89b-12d3-a456-426614174001';

function deferred() {
  let resolve!: (value: { valetSessionId: string }) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<{ valetSessionId: string }>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function clientWith(submitRating: (rating: number) => Promise<{ valetSessionId: string }>): GuestApiClient {
  return { submitRating } as unknown as GuestApiClient;
}

describe('T5 rating submission concurrency/authority fence', () => {
  it('serializes duplicate presses synchronously with one real mutation', async () => {
    const network = deferred();
    const submitRating = vi.fn(() => network.promise);
    const client = clientWith(submitRating);
    const coordinator = new GuestRatingSubmission();
    const observed: RatingOutcome[] = [];
    const first = coordinator.submit(client, visit, 5, (status) => observed.push(status));
    const second = coordinator.submit(client, visit, 5, (status) => observed.push(status));
    expect(await second).toBe(false);
    expect(submitRating).toHaveBeenCalledTimes(1);
    network.resolve({ valetSessionId: visit });
    expect(await first).toBe(true);
    expect(observed).toEqual(['saving', 'saved']);
  });

  it('rejects stale response when current visit changes even before old request resolves', async () => {
    const old = deferred();
    const next = deferred();
    const firstClient = clientWith(() => old.promise);
    const nextClient = clientWith(() => next.promise);
    const coordinator = new GuestRatingSubmission();
    const observedOld: RatingOutcome[] = [];
    const observedNext: RatingOutcome[] = [];
    const first = coordinator.submit(firstClient, visit, 4, (state) => observedOld.push(state));
    const replacement = coordinator.submit(nextClient, otherVisit, 2, (state) => observedNext.push(state));
    old.resolve({ valetSessionId: visit });
    await first;
    next.resolve({ valetSessionId: otherVisit });
    await replacement;
    expect(observedOld).toEqual(['saving']);
    expect(observedNext).toEqual(['saving', 'saved']);
  });

  it('invalidates pending result on logout/background/unmount without success', async () => {
    const network = deferred();
    const coordinator = new GuestRatingSubmission();
    const observed: RatingOutcome[] = [];
    const promise = coordinator.submit(clientWith(() => network.promise), visit, 3,
      (status) => observed.push(status));
    coordinator.invalidate();
    network.resolve({ valetSessionId: visit });
    await promise;
    expect(observed).toEqual(['saving']);
  });

  it('never reports success on a different authoritative response visit', async () => {
    const observed: RatingOutcome[] = [];
    await new GuestRatingSubmission().submit(clientWith(async () => ({ valetSessionId: otherVisit })),
      visit, 1, (value) => observed.push(value));
    expect(observed).toEqual(['saving', 'unknown']);
  });

  it.each([
    ['ambiguous network', new GuestApiError({ status: 0, code: 'MUTATION_OUTCOME_UNKNOWN', message: '' }), 'unknown'],
    ['server failure', new GuestApiError({ status: 503, code: 'SERVICE_UNAVAILABLE', message: '' }), 'unknown'],
    ['409 immutable conflict', new GuestApiError({ status: 409, code: 'GUEST_RATING_CONFLICT', message: '' }), 'conflict'],
    ['409 rating unavailable', new GuestApiError({ status: 409, code: 'GUEST_RATING_NOT_AVAILABLE', message: '' }), 'unavailable'],
    ['409 unrelated failure', new GuestApiError({ status: 409, code: 'REQUEST_FAILED', message: '' }), 'failed'],
    ['403 revoked', new GuestApiError({ status: 403, code: 'GUEST_ACCESS_INVALID', message: '' }), 'failed'],
    ['429 admitted denial', new GuestApiError({ status: 429, code: 'GUEST_ACCESS_RATE_LIMITED', message: '' }), 'failed'],
  ] as const)('classifies %s safely', async (_case, error, expected) => {
    const observed: RatingOutcome[] = [];
    const send = vi.fn(async () => { throw error; });
    await new GuestRatingSubmission().submit(clientWith(send), visit, 5,
      (status) => observed.push(status));
    expect(observed).toEqual(['saving', expected]);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
