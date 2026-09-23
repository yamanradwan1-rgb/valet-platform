import { describe, expect, it } from "vitest";

import type { SelectedDashboardScope } from "../../components/scope";
import { ScopeGenerationGuard } from "../../lib/scope/scope-generation";
import {
  formatExactCurrencyValues,
  formatExactDecimal,
} from "./intelligence-format";
import {
  intelligenceRequestKey,
  type IntelligenceRequestDescriptor,
} from "./intelligence-query-identity";
import {
  intelligenceAnalyticsEndpointFamily,
  intelligenceScope,
} from "./intelligence-scope";

const organization = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  name: "Org",
  timezone: "Asia/Amman",
};
const location = {
  code: "MAIN",
  currency: "JOD",
  locationId: "22222222-2222-4222-8222-222222222222",
  name: "Main",
  status: "ACTIVE" as const,
  timezone: "Asia/Amman",
};

function company(kind: "ALL_LOCATIONS" | "LOCATION"): SelectedDashboardScope {
  return {
    authority: "COMPANY_ADMIN",
    context: {
      capabilities: [],
      organization,
      scope: kind === "ALL_LOCATIONS"
        ? { kind: "ALL_LOCATIONS" }
        : { kind: "LOCATION", locationId: location.locationId },
      selectedLocation: kind === "LOCATION" ? location : null,
    },
  };
}

const period: IntelligenceRequestDescriptor = {
  endpointFamily: "COMPANY_ANALYTICS",
  from: "2026-09-01",
  to: "2026-09-23",
};

function key(overrides: Partial<Parameters<typeof intelligenceRequestKey>[0]> = {}) {
  return intelligenceRequestKey({
    descriptor: period,
    identityGeneration: 3,
    retryRevision: 0,
    scope: { kind: "COMPANY", organizationId: organization.organizationId },
    selectionRevision: 7,
    sessionGeneration: 5,
    ...overrides,
  });
}

describe("MD-05 intelligence scope and generations", () => {
  it("maps CA All Locations to COMPANY and active CA/LM exact scopes to LOCATION", () => {
    const companyScope = intelligenceScope(company("ALL_LOCATIONS"));
    expect(companyScope).toEqual({
      kind: "COMPANY",
      organizationId: organization.organizationId,
    });
    expect(intelligenceAnalyticsEndpointFamily(companyScope!, "LOCATION_OPERATIONS"))
      .toBe("COMPANY_ANALYTICS");
    expect(intelligenceScope(company("LOCATION"))).toEqual({
      kind: "LOCATION",
      locationId: location.locationId,
      organizationId: organization.organizationId,
    });
    expect(intelligenceScope({
      authority: "LOCATION_MANAGER",
      location,
      organization,
    })).toEqual({
      kind: "LOCATION",
      locationId: location.locationId,
      organizationId: organization.organizationId,
    });
  });

  it("rejects inactive, grant-set, Supervisor and subscription-only scopes", () => {
    expect(intelligenceScope({
      ...company("LOCATION"),
      context: {
        ...(company("LOCATION") as Extract<SelectedDashboardScope, { authority: "COMPANY_ADMIN" }>).context,
        selectedLocation: { ...location, status: "INACTIVE" },
      },
    } as SelectedDashboardScope)).toBeNull();
    expect(intelligenceScope({
      authority: "LOCATION_MANAGER",
      location: { ...location, status: "INACTIVE" },
      organization,
    })).toBeNull();
    expect(intelligenceScope({
      authority: "LOCATION_MANAGER_GRANT_SET",
      organization,
    })).toBeNull();
    expect(intelligenceScope({
      authority: "COMPANY_ADMIN_SUBSCRIPTION",
      organization,
    })).toBeNull();
    expect(intelligenceScope({
      authority: "SUPERVISOR",
      context: {
        activeShift: {
          locationId: location.locationId,
          shiftId: "33333333-3333-4333-8333-333333333333",
          startedAt: "2026-09-23T08:00:00Z",
          status: "ACTIVE",
        },
        authority: "SUPERVISOR",
        location: {
          code: location.code,
          currency: location.currency,
          locationId: location.locationId,
          name: location.name,
        },
        membershipId: "44444444-4444-4444-8444-444444444444",
        organization: {
          name: organization.name,
          organizationId: organization.organizationId,
        },
      },
    })).toBeNull();
  });

  it("changes the request key for every authority and period generation fact", () => {
    const first = key();
    expect(key({ identityGeneration: 4 })).not.toBe(first);
    expect(key({ sessionGeneration: 6 })).not.toBe(first);
    expect(key({ selectionRevision: 8 })).not.toBe(first);
    expect(key({ retryRevision: 1 })).not.toBe(first);
    expect(key({ scope: { kind: "COMPANY", organizationId: "other-org" } })).not.toBe(first);
    expect(key({ descriptor: { ...period, from: "2026-09-02" } })).not.toBe(first);
    expect(key({ descriptor: { ...period, to: "2026-09-22" } })).not.toBe(first);
  });

  it("changes keys for scope, location, endpoint family, report kind and selector", () => {
    const locationScope = {
      kind: "LOCATION" as const,
      locationId: location.locationId,
      organizationId: organization.organizationId,
    };
    const operations = key({
      descriptor: { endpointFamily: "LOCATION_OPERATIONS", from: "2026-09-01", to: "2026-09-23" },
      scope: locationScope,
    });
    expect(operations).not.toBe(key());
    expect(operations).not.toBe(key({
      descriptor: { endpointFamily: "LOCATION_INCIDENTS", from: "2026-09-01", to: "2026-09-23" },
      scope: locationScope,
    }));
    expect(operations).not.toBe(key({
      descriptor: { endpointFamily: "LOCATION_OPERATIONS", from: "2026-09-01", to: "2026-09-23" },
      scope: { ...locationScope, locationId: "other-location" },
    }));
    const daily = key({
      descriptor: { endpointFamily: "COMPANY_REPORT", reportKind: "DAILY", date: "2026-09-23" },
    });
    const weekly = key({
      descriptor: { endpointFamily: "COMPANY_REPORT", reportKind: "WEEKLY", weekStart: "2026-09-21" },
    });
    expect(daily).not.toBe(weekly);
    expect(daily).not.toBe(key({
      descriptor: { endpointFamily: "COMPANY_REPORT", reportKind: "DAILY", date: "2026-09-22" },
    }));
  });

  it("fences old success and failure across A to B to A", () => {
    const guard = new ScopeGenerationGuard();
    const oldA = guard.begin();
    const modeB = guard.begin();
    const newA = guard.begin();
    expect(guard.accept(oldA, {
      kind: "success", data: "old-a",
    })).toBeUndefined();
    expect(guard.accept(modeB, {
      kind: "failure", error: new Error("old-b"),
    })).toBeUndefined();
    expect(guard.accept(newA, {
      kind: "success", data: "new-a",
    })).toEqual({ kind: "success", data: "new-a" });
  });

  it("discards aborted settlement and cannot let old failure replace new success", () => {
    const guard = new ScopeGenerationGuard();
    const old = guard.begin();
    const current = guard.begin();
    expect(old.signal.aborted).toBe(true);
    expect(guard.accept(current, {
      kind: "success", data: "current",
    })).toEqual({ kind: "success", data: "current" });
    expect(guard.accept(old, {
      kind: "failure", error: new Error("late"),
    })).toBeUndefined();
  });

  it("preserves exact decimals, unavailable nulls and separate currencies", () => {
    expect(formatExactDecimal("12345678901234567890.123", "en"))
      .toBe("12345678901234567890.123");
    expect(formatExactDecimal(null, "ar")).toBe("غير متاح");
    expect(formatExactCurrencyValues([
      { currency: "JOD", value: "10.123" },
      { currency: "USD", value: "20.456" },
    ], "en")).toEqual([
      { currency: "JOD", text: "10.123 JOD" },
      { currency: "USD", text: "20.456 USD" },
    ]);
  });
});
