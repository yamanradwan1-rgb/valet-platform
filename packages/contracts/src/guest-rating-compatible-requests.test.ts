import { describe, expect, it } from "vitest";

import {
  guestRatingScopedFeedbackRequestSchema as scoped,
  guestRatingSubmissionRequestSchema as legacy,
  guestRatingSubmissionResponseSchema as response,
  guestRatingSubmissionUnionSchema as combined,
} from "./guest-rating.js";

const visit = "00000000-0000-4000-8000-000000000001";
const validResponse = {
  rating: 4,
  ratedAt: "2026-11-27T10:00:00.000+03:00",
  valetSessionId: visit,
};

describe("Issue #463 CT-01/02/06 strict backwards-compatible requests", () => {
  it.each([1, 2, 3, 4, 5])(
    "keeps legacy rating %i accepted without changing old parser",
    (rating) => {
      expect(legacy.parse({ rating })).toEqual({ rating });
      expect(combined.parse({ rating })).toEqual({ rating });
    },
  );

  it("keeps the original strict three-field success response", () => {
    expect(response.parse(validResponse)).toEqual(validResponse);
    expect(response.safeParse({ ...validResponse, comment: null }).success).toBe(false);
    expect(response.safeParse({ ...validResponse, expectedValetSessionId: visit }).success)
      .toBe(false);
  });

  it.each([
    { rating: 4, expectedValetSessionId: visit },
    { rating: 4, expectedValetSessionId: visit, comment: null },
    { rating: 4, expectedValetSessionId: visit, comment: "" },
    { rating: 4, expectedValetSessionId: visit, comment: " Arabic \r\nEnglish " },
    { rating: 4, expectedValetSessionId: visit, comment: "👩‍💻" },
  ])("accepts new scoped request only through new schema", (input) => {
    const parsed = scoped.parse(input);
    expect(parsed.rating).toBe(input.rating);
    expect(parsed.expectedValetSessionId).toBe(visit);
    expect(combined.parse(input)).toEqual(parsed);
    expect(legacy.safeParse(input).success).toBe(false);
  });

  it("canonicalizes text on the scoped schema boundary, never on legacy", () => {
    const submitted = {
      rating: 4, expectedValetSessionId: visit, comment: " مرحبا\r\n👩‍💻 ",
    };
    const canonical = { ...submitted, comment: "مرحبا\n👩‍💻" };
    expect(scoped.parse(submitted)).toEqual(canonical);
    expect(combined.parse(submitted)).toEqual(canonical);
    expect(scoped.parse({
      rating: 4, expectedValetSessionId: visit, comment: "\u00a0\t ",
    })).toEqual({ ...submitted, comment: null });
  });

  it.each([
    { rating: 4, comment: "without asserted visit" },
    { rating: 4, comment: null },
    { rating: 4, expectedValetSessionId: null },
    { rating: 4, expectedValetSessionId: "not-a-uuid" },
    { rating: 4, expectedValetSessionId: visit, comment: 5 },
    { rating: 4, expectedValetSessionId: visit, comment: "\ud800" },
    { rating: 4, expectedValetSessionId: visit, comment: "\u202e" },
    { rating: 4, expectedValetSessionId: visit, comment: " ".repeat(1001) },
    { rating: 4, expectedValetSessionId: visit, organizationId: visit },
    { rating: 4, expectedValetSessionId: visit, valetSessionId: visit },
    { rating: 4, something: "not in legacy" },
    { rating: "4" },
    { rating: 0 },
    { rating: 6 },
    { rating: 2.5 },
    {},
    null,
    [],
  ])("rejects invalid and out-of-scope payload %#", (input) => {
    expect(combined.safeParse(input).success).toBe(false);
  });

  it("rejects extra fields in both branches and never strips a comment", () => {
    const input = { rating: 4, comment: "private" };
    expect(legacy.safeParse(input).success).toBe(false);
    expect(combined.safeParse(input).success).toBe(false);
    expect(scoped.safeParse(input).success).toBe(false);
  });
});
