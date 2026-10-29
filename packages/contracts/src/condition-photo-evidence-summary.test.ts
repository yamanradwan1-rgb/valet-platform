import { describe, expect, it } from "vitest";

import { conditionPhotoEvidenceSummarySchema } from "./condition-photo-evidence-summary";

const valetSessionId = "11111111-1111-4111-8111-111111111111";
const verifiedAt = "2026-10-29T00:00:00.000Z";
const first = {
  operationId: "22222222-2222-4222-8222-222222222222",
  vehiclePhotoId: "33333333-3333-4333-8333-333333333333",
  verifiedAt, status: "VERIFIED",
};
const second = {
  operationId: "11111111-1111-4111-8111-111111111112",
  vehiclePhotoId: "33333333-3333-4333-8333-333333333334",
  verifiedAt, status: "VERIFIED",
};

describe("Issue #336 actor-scoped condition photo evidence metadata", () => {
  it("permits empty history and a truthful newest-four window of ten", () => {
    expect(conditionPhotoEvidenceSummarySchema.parse({
      valetSessionId, verifiedTotal: 0, latestVerified: [],
    }).verifiedTotal).toBe(0);
    const result = conditionPhotoEvidenceSummarySchema.parse({
      valetSessionId, verifiedTotal: 10, latestVerified: [first, second],
    });
    expect(result.latestVerified).toHaveLength(2);
  });

  it("rejects optimistic, duplicated, out-of-order and private fields", () => {
    const base = { valetSessionId, verifiedTotal: 2, latestVerified: [first, second] };
    expect(conditionPhotoEvidenceSummarySchema.safeParse({
      ...base, verifiedTotal: 1,
    }).success).toBe(false);
    expect(conditionPhotoEvidenceSummarySchema.safeParse({
      ...base, latestVerified: [first, first],
    }).success).toBe(false);
    expect(conditionPhotoEvidenceSummarySchema.safeParse({
      ...base, latestVerified: [second, first],
    }).success).toBe(false);
    expect(conditionPhotoEvidenceSummarySchema.safeParse({
      ...base, objectKey: "private-object-location",
    }).success).toBe(false);
    expect(conditionPhotoEvidenceSummarySchema.safeParse({
      ...base, latestVerified: [{ ...first, byteSize: 100 }],
    }).success).toBe(false);
    expect(conditionPhotoEvidenceSummarySchema.safeParse({
      ...base, verifiedTotal: 5,
      latestVerified: [first, second, first, second, first],
    }).success).toBe(false);
  });
});
