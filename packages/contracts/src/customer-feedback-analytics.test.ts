import { describe, expect, it } from "vitest";

import { customerFeedbackAnalyticsResponseSchema } from "./customer-feedback-analytics.js";

const valid = {
  scope: "COMPANY",
  from: "2026-10-20",
  to: "2026-10-20",
  eligibleCompletedVisits: 3,
  ratedVisits: 2,
  averageRating: "4.0000",
  participationRate: "0.666667",
  distribution: { five: 1, four: 0, three: 1, two: 0, one: 0 },
  recentRatings: [{
    visitReference: "VISIT-ABCDEF123456",
    rating: 5,
    completedAt: "2026-10-20T10:10:00.000Z",
    ratedAt: "2026-10-22T12:20:00.000Z",
    authorizedLocationLabel: "Amman",
    locationTimezone: "Asia/Amman",
  }],
} as const;

describe("Issue #313 exact rating analytics response", () => {
  it("accepts real completed cohort and late ratedAt", () => {
    expect(customerFeedbackAnalyticsResponseSchema.parse(valid)).toEqual(valid);
  });

  it("accepts empty and eligible-but-unrated periods, with truthful nulls", () => {
    const empty = {
      ...valid, eligibleCompletedVisits: 0, ratedVisits: 0,
      averageRating: null, participationRate: null,
      distribution: { five: 0, four: 0, three: 0, two: 0, one: 0 },
      recentRatings: [],
    };
    expect(customerFeedbackAnalyticsResponseSchema.safeParse(empty).success).toBe(true);
    expect(customerFeedbackAnalyticsResponseSchema.safeParse({
      ...empty, eligibleCompletedVisits: 4, participationRate: "0.000000",
    }).success).toBe(true);
  });

  it.each([
    { ratedVisits: 4 },
    { ratedVisits: 2, distribution: { ...valid.distribution, one: 1 } },
    { averageRating: "0.0000" },
    { averageRating: "5.5000" },
    { averageRating: null },
    { participationRate: "0.700000" },
    { participationRate: null },
    { participationRate: "1.000001" },
    { scope: "ALL_LOCATIONS" },
    { guestPhone: "+962" },
    { recentRatings: [{ ...valid.recentRatings[0], guestName: "Private" }] },
    { recentRatings: [{ ...valid.recentRatings[0], visitReference: "original-session-id" }] },
    { recentRatings: [{ ...valid.recentRatings[0], rating: 0 }] },
    { recentRatings: Array.from({ length: 5 }, () => valid.recentRatings[0]) },
  ])("rejects inconsistent or private response fields %#", (invalid) => {
    expect(customerFeedbackAnalyticsResponseSchema.safeParse({ ...valid, ...invalid }).success)
      .toBe(false);
  });
});
