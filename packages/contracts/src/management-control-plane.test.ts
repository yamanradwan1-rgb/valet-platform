import { describe, expect, it } from "vitest";

import {
  managementCapabilitySchema,
  managementContextQuerySchema,
  managementContextResponseSchema,
  managementListQuerySchema,
  managementLocationSchema,
  managementScopeSchema,
} from "./management-control-plane";

const locationId = "00000000-0000-4000-8000-000000000001";
const organizationId = "00000000-0000-4000-8000-000000000002";
const location = {
  code: "HQ",
  currency: "JOD",
  locationId,
  name: "Headquarters",
  status: "INACTIVE" as const,
  timezone: "Asia/Amman",
};
const organization = {
  name: "VAYLET Test",
  organizationId,
  timezone: "Asia/Amman",
};

describe("Management control-plane contracts", () => {
  it("uses an explicit discriminated scope without a fake Location", () => {
    expect(managementScopeSchema.parse({ kind: "ALL_LOCATIONS" })).toEqual({
      kind: "ALL_LOCATIONS",
    });
    expect(
      managementScopeSchema.parse({ kind: "LOCATION", locationId }),
    ).toEqual({ kind: "LOCATION", locationId });
    expect(
      managementScopeSchema.safeParse({ kind: "ALL_LOCATIONS", locationId })
        .success,
    ).toBe(false);
    expect(
      managementScopeSchema.safeParse({ kind: "LOCATION", locationId: "all" })
        .success,
    ).toBe(false);
  });

  it("strictly correlates context query scope and Location input", () => {
    expect(
      managementContextQuerySchema.parse({ scopeKind: "ALL_LOCATIONS" }),
    ).toEqual({ scopeKind: "ALL_LOCATIONS" });
    expect(
      managementContextQuerySchema.safeParse({
        locationId,
        scopeKind: "ALL_LOCATIONS",
      }).success,
    ).toBe(false);
    expect(
      managementContextQuerySchema.safeParse({ scopeKind: "LOCATION" }).success,
    ).toBe(false);
    expect(
      managementContextQuerySchema.safeParse({
        capability: "LOCATION_DASHBOARD_READ",
        locationId,
        scopeKind: "LOCATION",
      }).success,
    ).toBe(false);
  });

  it("bounds selector pagination and rejects unknown input", () => {
    expect(managementListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(managementListQuerySchema.parse({ limit: "100" })).toEqual({
      limit: 100,
    });
    expect(managementListQuerySchema.safeParse({ limit: 0 }).success).toBe(
      false,
    );
    expect(managementListQuerySchema.safeParse({ limit: 101 }).success).toBe(
      false,
    );
    expect(
      managementListQuerySchema.safeParse({ limit: 25, offset: 5 }).success,
    ).toBe(false);
    expect(
      managementListQuerySchema.safeParse({ cursor: "not!opaque" }).success,
    ).toBe(false);
  });

  it("keeps Location selector projection minimal and truthful", () => {
    expect(managementLocationSchema.parse(location)).toEqual(location);
    expect(
      managementLocationSchema.safeParse({
        ...location,
        activeSessionCount: 42,
      }).success,
    ).toBe(false);
    expect(
      managementLocationSchema.safeParse({ ...location, currency: "jod" })
        .success,
    ).toBe(false);
  });

  it("locks context scope to the selected Location correlation", () => {
    expect(
      managementContextResponseSchema.safeParse({
        capabilities: ["ALL_LOCATIONS_SCOPE_SELECT"],
        organization,
        scope: { kind: "ALL_LOCATIONS" },
        selectedLocation: null,
      }).success,
    ).toBe(true);
    expect(
      managementContextResponseSchema.safeParse({
        capabilities: ["LOCATION_DASHBOARD_READ"],
        organization,
        scope: { kind: "LOCATION", locationId },
        selectedLocation: location,
      }).success,
    ).toBe(true);
    expect(
      managementContextResponseSchema.safeParse({
        capabilities: [],
        organization,
        scope: { kind: "ALL_LOCATIONS" },
        selectedLocation: location,
      }).success,
    ).toBe(false);
  });

  it("defines Management capabilities without field-operation authority", () => {
    for (const forbidden of [
      "CHECK_IN_EXECUTE",
      "PARK_VEHICLE",
      "RETRIEVAL_EXECUTE",
      "HANDOFF_EXECUTE",
      "KEY_MOVE",
      "TASK_EXECUTE",
      "GPS_INGEST",
      "REFUND_EXECUTE",
      "SUPERVISOR_OVERRIDE",
    ]) {
      expect(managementCapabilitySchema.safeParse(forbidden).success).toBe(
        false,
      );
    }
    expect(managementCapabilitySchema.parse("LIVE_MAP_READ")).toBe(
      "LIVE_MAP_READ",
    );
  });
});
