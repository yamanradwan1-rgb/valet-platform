import { describe, expect, it } from "vitest";

import {
  guestRatingSubmissionRequestSchema,
  guestRatingSubmissionResponseSchema,
  guestRatingValueSchema,
} from "./guest-rating.js";

const sessionId = "00000000-0000-4000-8000-000000000001";
const ratedAt = "2026-09-17T20:00:00.000Z";

describe("MGT-BE-09 Guest Rating contracts", () => {
  it.each([1, 3, 5])("accepts rating %i", (rating) => {
    expect(guestRatingValueSchema.parse(rating)).toBe(rating);
    expect(guestRatingSubmissionRequestSchema.parse({ rating })).toEqual({ rating });
  });

  it.each([
    0,
    6,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "1",
    null,
    undefined,
  ])("rejects invalid rating value %s", (rating) => {
    expect(guestRatingValueSchema.safeParse(rating).success).toBe(false);
    expect(guestRatingSubmissionRequestSchema.safeParse({ rating }).success).toBe(false);
  });

  it("rejects missing and unknown request fields", () => {
    expect(guestRatingSubmissionRequestSchema.safeParse({}).success).toBe(false);
    expect(
      guestRatingSubmissionRequestSchema.safeParse({
        rating: 3,
        valetSessionId: sessionId,
      }).success,
    ).toBe(false);
  });

  it("accepts only the exact Guest-safe response shape", () => {
    const response = {
      ratedAt,
      rating: 4,
      valetSessionId: sessionId,
    };
    expect(guestRatingSubmissionResponseSchema.parse(response)).toEqual(response);
  });

  it.each([
    { ratedAt, rating: 0, valetSessionId: sessionId },
    { ratedAt, rating: 6, valetSessionId: sessionId },
    { ratedAt: "not-a-timestamp", rating: 3, valetSessionId: sessionId },
    { ratedAt, rating: 3, valetSessionId: "not-a-uuid" },
    { rating: 3, valetSessionId: sessionId },
    { ratedAt, valetSessionId: sessionId },
    { ratedAt, rating: 3 },
  ])("rejects invalid response shape %#", (response) => {
    expect(guestRatingSubmissionResponseSchema.safeParse(response).success).toBe(false);
  });

  it("rejects unknown response fields", () => {
    expect(
      guestRatingSubmissionResponseSchema.safeParse({
        ratedAt,
        rating: 5,
        valetSessionId: sessionId,
        organizationId: "00000000-0000-4000-8000-000000000002",
      }).success,
    ).toBe(false);
  });
});
