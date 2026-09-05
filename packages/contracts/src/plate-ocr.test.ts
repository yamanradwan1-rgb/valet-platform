import { describe, expect, it } from "vitest";
import { plateOcrRequestSchema, plateOcrResponseSchema } from "./plate-ocr.js";

describe("assistive plate OCR contract", () => {
  const candidate = { plateNumberRaw: "12-34567", confidence: 0.9 };
  it.each([
    { status: "MATCH", candidate },
    { status: "NO_MATCH" },
    { status: "UNAVAILABLE" },
  ])("accepts only a bounded provider-neutral result %j", (result) => {
    expect(plateOcrResponseSchema.parse(result)).toEqual(result);
  });
  it.each([NaN, Infinity, -0.1, 1.1, "0.9"])(
    "rejects invalid confidence %s",
    (confidence) => {
      expect(
        plateOcrResponseSchema.safeParse({
          status: "MATCH",
          candidate: { ...candidate, confidence },
        }).success,
      ).toBe(false);
    },
  );
  it.each(["", "  ", "x".repeat(41)])("bounds plate text", (plateNumberRaw) => {
    expect(
      plateOcrResponseSchema.safeParse({
        status: "MATCH",
        candidate: { ...candidate, plateNumberRaw },
      }).success,
    ).toBe(false);
  });
  it.each([
    { status: "MATCH" },
    { status: "VERIFIED", candidate },
    { status: "NO_MATCH", candidate },
    { status: "MATCH", candidate: { ...candidate, region: "jo" } },
    { status: "MATCH", candidate, provider: "vendor" },
  ])("rejects malformed/extra metadata %j", (value) => {
    expect(plateOcrResponseSchema.safeParse(value).success).toBe(false);
  });
  it("accepts exactly the existing countries and rejects authority claims", () => {
    const request = {
      targetLocationId: "00000000-0000-4000-8000-000000000001",
      plateCountry: "JO",
    };
    for (const plateCountry of ["JO", "AE", "SA", "KW", "BH", "OTHER"])
      expect(
        plateOcrRequestSchema.safeParse({ ...request, plateCountry }).success,
      ).toBe(true);
    for (const plateCountry of ["US", "jo", "", null])
      expect(
        plateOcrRequestSchema.safeParse({ ...request, plateCountry }).success,
      ).toBe(false);
    for (const field of [
      "userId",
      "membershipId",
      "organizationId",
      "role",
      "shiftId",
    ])
      expect(
        plateOcrRequestSchema.safeParse({ ...request, [field]: "forged" })
          .success,
      ).toBe(false);
  });
});
