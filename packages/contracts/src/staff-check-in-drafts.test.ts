import { describe, expect, it } from "vitest";

import {
  checkInDraftsQuerySchema,
  staffCheckInDraftsResponseSchema,
} from "./staff-check-in-drafts.js";

describe("staffCheckInDrafts contracts", () => {
  it("validates valid query parameters", () => {
    const query = {
      locationId: "11111111-1111-4111-8111-111111111111",
    };

    const parsed = checkInDraftsQuerySchema.parse(query);
    expect(parsed).toEqual(query);
  });

  it("rejects invalid locationId in query", () => {
    expect(() =>
      checkInDraftsQuerySchema.parse({ locationId: "invalid-uuid" }),
    ).toThrow();
  });

  it("rejects unknown query fields due to strict schema", () => {
    expect(() =>
      checkInDraftsQuerySchema.parse({
        extra: "unknown",
        locationId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toThrow();
  });

  it("validates empty drafts response", () => {
    const payload = { drafts: [] };
    const parsed = staffCheckInDraftsResponseSchema.parse(payload);
    expect(parsed.drafts).toEqual([]);
  });

  it("validates single draft with full vehicle details", () => {
    const payload = {
      drafts: [
        {
          conditionCompletedAt: "2026-08-21T18:00:00.000Z",
          createdAt: "2026-08-21T17:55:00.000Z",
          sessionId: "22222222-2222-4222-8222-222222222222",
          vehicle: {
            color: "Silver",
            make: "Toyota",
            model: "Camry",
            plateCountry: "JO",
            plateNumberRaw: "50-12345",
            temporaryDescriptor: null,
          },
        },
      ],
    };

    const parsed = staffCheckInDraftsResponseSchema.parse(payload);
    expect(parsed).toEqual(payload);
  });

  it("validates draft with temporary descriptor and null conditionCompletedAt", () => {
    const payload = {
      drafts: [
        {
          conditionCompletedAt: null,
          createdAt: "2026-08-21T17:55:00.000Z",
          sessionId: "22222222-2222-4222-8222-222222222222",
          vehicle: {
            color: null,
            make: null,
            model: null,
            plateCountry: null,
            plateNumberRaw: null,
            temporaryDescriptor: "Blue sedan with scratched door",
          },
        },
      ],
    };

    const parsed = staffCheckInDraftsResponseSchema.parse(payload);
    expect(parsed.drafts[0]?.vehicle.temporaryDescriptor).toBe(
      "Blue sedan with scratched door",
    );
    expect(parsed.drafts[0]?.conditionCompletedAt).toBeNull();
  });

  it("rejects unexpected extra response properties like customer data", () => {
    const payload = {
      drafts: [
        {
          conditionCompletedAt: null,
          createdAt: "2026-08-21T17:55:00.000Z",
          customerPhone: "+962790000000",
          sessionId: "22222222-2222-4222-8222-222222222222",
          vehicle: {
            color: null,
            make: null,
            model: null,
            plateCountry: null,
            plateNumberRaw: null,
            temporaryDescriptor: "Draft",
          },
        },
      ],
    };

    expect(() => staffCheckInDraftsResponseSchema.parse(payload)).toThrow();
  });
});
