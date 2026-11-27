import { describe, expect, it } from "vitest";
import {
  customerFeedbackAnalyticsResponseSchema as numeric,
  customerFeedbackAnalyticsWithCommentsResponseSchema as expanded,
} from "./customer-feedback-analytics.js";

const row = {
  visitReference: "VISIT-ABCDEF123456",
  rating: 5,
  completedAt: "2026-10-20T10:10:00.000Z",
  ratedAt: "2026-10-22T12:20:00.000Z",
  authorizedLocationLabel: "Amman",
  locationTimezone: "Asia/Amman",
};
const original = {
  scope: "COMPANY",
  from: "2026-10-20",
  to: "2026-10-20",
  eligibleCompletedVisits: 3,
  ratedVisits: 2,
  averageRating: "4.0000",
  participationRate: "0.666667",
  distribution: { five: 1, four: 0, three: 1, two: 0, one: 0 },
  recentRatings: [row],
};

describe("Issue #463 CT-09 strict separate analytics representations", () => {
  it("retains identical default numeric strict response", () => {
    expect(numeric.parse(original)).toEqual(original);
    expect(numeric.safeParse({
      ...original, recentRatings: [{ ...row, comment: null }],
    }).success).toBe(false);
    expect(expanded.safeParse(original).success).toBe(false);
  });

  it.each([null, "Great service", "مرحبا 👩‍💻\nLiteral <script>"])(
    "requires exact nullable comment in expanded rows: %s",
    (comment) => {
      const supplied = {
        ...original, recentRatings: [{ ...row, comment }],
      };
      expect(expanded.parse(supplied)).toEqual(supplied);
      expect(numeric.safeParse(supplied).success).toBe(false);
    },
  );

  it("keeps cohort/metrics invariant and preserves all original keys", () => {
    const supplied = {
      ...original, recentRatings: [{ ...row, comment: "worked" }],
    };
    const projection = expanded.parse(supplied);
    const legacyView = {
      ...projection,
      recentRatings: projection.recentRatings.map(({ comment, ...numericRow }) => {
        expect(comment).toBe("worked");
        return numericRow;
      }),
    };
    expect(legacyView).toEqual(numeric.parse(original));
    expect(expanded.safeParse({
      ...supplied, distribution: { ...supplied.distribution, one: 1 },
    }).success).toBe(false);
    expect(expanded.safeParse({
      ...supplied, ratedVisits: 0,
    }).success).toBe(false);
  });

  it.each([
    undefined, "", " leading", "trailing ", "A\r\nB",
    "\ud800", "\u202e", "😀".repeat(1001),
  ])("rejects missing, noncanonical or malformed returned text", (comment) => {
    expect(expanded.safeParse({
      ...original, recentRatings: [{ ...row, comment }],
    }).success).toBe(false);
  });

  it("accepts empty recent list and rejects more than four rows", () => {
    const empty = {
      ...original, eligibleCompletedVisits: 0, ratedVisits: 0,
      averageRating: null, participationRate: null,
      distribution: { five: 0, four: 0, three: 0, two: 0, one: 0 },
      recentRatings: [],
    };
    expect(expanded.safeParse(empty).success).toBe(true);
    expect(expanded.safeParse({
      ...original,
      eligibleCompletedVisits: 5,
      ratedVisits: 5,
      participationRate: "1.000000",
      averageRating: "5.0000",
      distribution: { five: 5, four: 0, three: 0, two: 0, one: 0 },
      recentRatings: Array.from({ length: 5 }, () => ({ ...row, comment: null })),
    }).success).toBe(false);
  });

  it("rejects extra author, raw session ID and text outside latest4", () => {
    const supplied = { ...original, recentRatings: [{ ...row, comment: null }] };
    expect(expanded.safeParse({ ...supplied, rawComment: "secret" }).success).toBe(false);
    expect(expanded.safeParse({
      ...supplied, recentRatings: [{ ...row, comment: null, authorId: "secret" }],
    }).success).toBe(false);
    expect(expanded.safeParse({
      ...supplied, recentRatings: [{ ...row, comment: null, valetSessionId: "hidden" }],
    }).success).toBe(false);
  });
});
