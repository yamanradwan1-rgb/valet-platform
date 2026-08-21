import { describe, expect, it } from "vitest";

import {
  checkInContinuationsQuerySchema,
  staffCheckInContinuationsResponseSchema,
} from "./staff-check-in-continuations.js";

describe("Staff Check-In Continuations Contracts", () => {
  describe("checkInContinuationsQuerySchema", () => {
    it("accepts a valid locationId UUID", () => {
      const parsed = checkInContinuationsQuerySchema.safeParse({
        locationId: "11111111-1111-4111-8111-111111111111",
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.locationId).toBe(
          "11111111-1111-4111-8111-111111111111",
        );
      }
    });

    it("rejects non-UUID locationId", () => {
      const parsed = checkInContinuationsQuerySchema.safeParse({
        locationId: "not-a-uuid",
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects unknown query fields", () => {
      const parsed = checkInContinuationsQuerySchema.safeParse({
        extra: "value",
        locationId: "11111111-1111-4111-8111-111111111111",
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe("staffCheckInContinuationsResponseSchema", () => {
    it("accepts an empty continuations array", () => {
      const parsed = staffCheckInContinuationsResponseSchema.safeParse({
        continuations: [],
      });
      expect(parsed.success).toBe(true);
    });

    it("accepts a valid continuation with populated vehicle", () => {
      const parsed = staffCheckInContinuationsResponseSchema.safeParse({
        continuations: [
          {
            createdAt: "2026-08-21T18:00:00.000Z",
            sessionId: "22222222-2222-4222-8222-222222222222",
            vehicle: {
              color: "Black",
              make: "BMW",
              model: "740i",
              plateCountry: "JO",
              plateNumberRaw: "12-34567",
              temporaryDescriptor: null,
            },
          },
        ],
      });
      expect(parsed.success).toBe(true);
    });

    it("accepts null vehicle fields", () => {
      const parsed = staffCheckInContinuationsResponseSchema.safeParse({
        continuations: [
          {
            createdAt: "2026-08-21T18:00:00.000Z",
            sessionId: "22222222-2222-4222-8222-222222222222",
            vehicle: {
              color: null,
              make: null,
              model: null,
              plateCountry: null,
              plateNumberRaw: null,
              temporaryDescriptor: "Red SUV near valet booth",
            },
          },
        ],
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects customer PII and extra fields in continuation payload", () => {
      const parsed = staffCheckInContinuationsResponseSchema.safeParse({
        continuations: [
          {
            createdAt: "2026-08-21T18:00:00.000Z",
            customerId: "33333333-3333-4333-8333-333333333333",
            customerPhone: "+962791234567",
            sessionId: "22222222-2222-4222-8222-222222222222",
            vehicle: {
              color: "Black",
              make: "BMW",
              model: "740i",
              plateCountry: "JO",
              plateNumberRaw: "12-34567",
              temporaryDescriptor: null,
            },
          },
        ],
      });
      expect(parsed.success).toBe(false);
    });
  });
});
