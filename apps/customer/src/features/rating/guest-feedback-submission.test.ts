import { describe, expect, it, vi } from "vitest";

import { GuestApiError } from "../../lib/api/api-error";
import type { GuestApiClient } from "../../lib/api/guest-api-client";
import { GuestRatingSubmission, type RatingOutcome } from "./guest-rating-submission";

const visit = "123e4567-e89b-12d3-a456-426614174000";
const otherVisit = "123e4567-e89b-12d3-a456-426614174001";

function deferred() {
  let resolve!: (response: { valetSessionId: string; rating: number }) => void;
  const promise = new Promise<{ valetSessionId: string; rating: number }>((done) => { resolve = done; });
  return { resolve, promise };
}

describe("#463 scoped immutable comment submission", () => {
  it("snapshots exact visit/stars/comment and synchronously blocks duplicate POST", async () => {
    const network = deferred();
    const submitFeedback = vi.fn(() => network.promise);
    const client = { submitFeedback, submitRating: vi.fn() } as unknown as GuestApiClient;
    const coordinator = new GuestRatingSubmission();
    const events: RatingOutcome[] = [];
    const original = coordinator.submitFeedback(client, visit, 4, "ممتاز\nThank you", (v) => events.push(v));
    const duplicate = coordinator.submitFeedback(client, visit, 5, "changed", (v) => events.push(v));
    expect(await duplicate).toBe(false);
    expect(submitFeedback).toHaveBeenCalledOnce();
    expect(submitFeedback).toHaveBeenCalledWith({
      expectedValetSessionId: visit, rating: 4, comment: "ممتاز\nThank you",
    });
    expect(client.submitRating).not.toHaveBeenCalled();
    network.resolve({ valetSessionId: visit, rating: 4 });
    await original;
    expect(events).toEqual(["saving", "saved"]);
  });

  it("invalidates a stale settlement and rejects mismatched rating even on matching visit", async () => {
    const old = deferred();
    const next = deferred();
    const firstClient = { submitFeedback: () => old.promise } as unknown as GuestApiClient;
    const secondClient = { submitFeedback: () => next.promise } as unknown as GuestApiClient;
    const coordinator = new GuestRatingSubmission();
    const firstEvents: RatingOutcome[] = [];
    const secondEvents: RatingOutcome[] = [];
    const first = coordinator.submitFeedback(firstClient, visit, 4, "old", (s) => firstEvents.push(s));
    coordinator.invalidate();
    const second = coordinator.submitFeedback(secondClient, otherVisit, 5, null,
      (s) => secondEvents.push(s));
    old.resolve({ valetSessionId: visit, rating: 4 });
    next.resolve({ valetSessionId: otherVisit, rating: 3 });
    await Promise.all([first, second]);
    expect(firstEvents).toEqual(["saving"]);
    expect(secondEvents).toEqual(["saving", "unknown"]);
  });

  it.each([
    ["missing notice", "REQUEST_INVALID", 400, "failed"],
    ["not completed", "GUEST_RATING_NOT_AVAILABLE", 409, "unavailable"],
    ["immutable conflict", "GUEST_RATING_CONFLICT", 409, "conflict"],
    ["revoked", "GUEST_ACCESS_INVALID", 401, "unavailable"],
    ["unknown commit", "MUTATION_OUTCOME_UNKNOWN", 503, "unknown"],
  ] as const)("classifies %s without a stars-only fallback", async (_label, code, status, expected) => {
    const client = {
      submitFeedback: vi.fn(async () => {
        throw new GuestApiError({ status, code, message: "private diagnostic" });
      }),
      submitRating: vi.fn(),
    } as unknown as GuestApiClient;
    const events: RatingOutcome[] = [];
    await new GuestRatingSubmission().submitFeedback(client, visit, 3, "text", (s) => events.push(s));
    expect(events).toEqual(["saving", expected]);
    expect(client.submitFeedback).toHaveBeenCalledOnce();
    expect(client.submitRating).not.toHaveBeenCalled();
  });
});
