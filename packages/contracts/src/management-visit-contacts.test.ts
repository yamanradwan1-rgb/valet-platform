import { describe, expect, it } from "vitest";

import {
  managementVisitContactNameCorrectionRequestSchema,
  managementVisitContactPhoneCorrectionRequestSchema,
  managementVisitContactSearchQuerySchema,
  managementVisitContactSearchResponseSchema,
  managementVisitHistoryQuerySchema,
} from "./index.js";

const uuid = "018f1234-5678-4abc-9234-56789abcdef0";

describe("management Visit Contact contracts", () => {
  it("requires exactly one strict search mode", () => {
    expect(managementVisitContactSearchQuerySchema.parse({ phone: "0790000000" }))
      .toEqual({ limit: 25, phone: "0790000000" });
    expect(managementVisitContactSearchQuerySchema.parse({
      plate: "12-ABC", plateCountry: "JO",
    })).toEqual({ limit: 25, plate: "12-ABC", plateCountry: "JO" });
    expect(managementVisitContactSearchQuerySchema.parse({ name: "أحمد" }))
      .toEqual({ limit: 25, name: "أحمد" });
    for (const value of [
      {},
      { phone: "0790000000", name: "Ahmad" },
      { plate: "12-ABC" },
      { plateCountry: "JO", name: "Ahmad" },
      { name: "Ahmad", unknown: "x" },
      { name: "A" },
      { name: "Ahmad", limit: 51 },
    ]) {
      expect(managementVisitContactSearchQuerySchema.safeParse(value).success).toBe(false);
    }
  });

  it("keeps cursors bounded and history query strict", () => {
    expect(managementVisitHistoryQuerySchema.parse({})).toEqual({ limit: 25 });
    expect(managementVisitHistoryQuerySchema.safeParse({ offset: 10 }).success).toBe(false);
    expect(managementVisitHistoryQuerySchema.safeParse({ cursor: "bad!" }).success).toBe(false);
    expect(managementVisitHistoryQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it("accepts only bounded Visit Contact projections", () => {
    const response = {
      items: [{
        associatedVehicles: [{ plateCountry: "JO", plateNumberRaw: "12-ABC", vehicleId: uuid }],
        completedVisitCount: 2,
        customerId: uuid,
        customerUpdatedAt: "2026-09-17T00:00:00.000Z",
        displayName: "Ahmad",
        kind: "CUSTOMER",
        latestVisit: {
          createdAt: "2026-09-17T00:00:00.000Z",
          locationId: uuid,
          locationName: "Main",
          valetSessionId: uuid,
        },
        phone: { kind: "MASKED", ending: "1234" },
      }],
      matchState: "UNIQUE",
      mode: "PHONE",
      nextCursor: null,
    };
    expect(managementVisitContactSearchResponseSchema.parse(response)).toEqual(response);
    expect(managementVisitContactSearchResponseSchema.safeParse({
      ...response,
      items: [{ ...response.items[0], customerAccessTokenHash: "secret" }],
    }).success).toBe(false);
  });

  it("keeps correction requests field-specific with mandatory CAS", () => {
    const expectedUpdatedAt = "2026-09-17T00:00:00.000Z";
    expect(managementVisitContactNameCorrectionRequestSchema.parse({
      displayName: null, expectedUpdatedAt,
    })).toEqual({ displayName: null, expectedUpdatedAt });
    expect(managementVisitContactPhoneCorrectionRequestSchema.parse({
      expectedUpdatedAt, phone: "0790000000",
    })).toEqual({ expectedUpdatedAt, phone: "0790000000" });
    expect(managementVisitContactNameCorrectionRequestSchema.safeParse({
      displayName: "Ahmad",
    }).success).toBe(false);
    expect(managementVisitContactPhoneCorrectionRequestSchema.safeParse({
      expectedUpdatedAt, phone: "0790000000", field: "anything",
    }).success).toBe(false);
  });
});
