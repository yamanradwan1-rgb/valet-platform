import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../api/dashboard-api-client";
import {
  boundedSelectorPage,
  composeDashboardCandidates,
  listActiveSupervisorScopes,
  readCompanyAdminSubscription,
  readLocationManagerSubscription,
  type CompanyAdminCandidate,
  type LocationManagerCandidate,
} from "./dashboard-scope";
import { ScopeGenerationGuard } from "./scope-generation";

const org = { organizationId: "11111111-1111-4111-8111-111111111111", name: "Org", timezone: "Asia/Amman" };
const location = {
  locationId: "22222222-2222-4222-8222-222222222222",
  name: "Main",
  code: "MAIN",
  status: "ACTIVE" as const,
  timezone: "Asia/Amman",
  currency: "JOD",
};

describe("dashboard scope foundation", () => {
  it("preserves mixed authority candidates instead of flattening to a highest role", () => {
    const ca: CompanyAdminCandidate = { authority: "COMPANY_ADMIN", organization: org };
    const lm: LocationManagerCandidate = { authority: "LOCATION_MANAGER", organization: org, location };
    const supervisor = {
      authority: "SUPERVISOR" as const,
      membershipId: "33333333-3333-4333-8333-333333333333",
      organization: { organizationId: org.organizationId, name: org.name },
      location: { locationId: location.locationId, name: location.name, code: location.code, currency: location.currency, timezone: location.timezone },
      activeShift: { locationId: location.locationId, shiftId: "44444444-4444-4444-8444-444444444444", startedAt: "2026-09-20T00:00:00Z", status: "ACTIVE" as const },
    };

    expect(composeDashboardCandidates({ companyAdmin: [ca], locationManager: [lm], supervisor: [supervisor] }).map((entry) => entry.authority)).toEqual([
      "COMPANY_ADMIN",
      "LOCATION_MANAGER",
      "SUPERVISOR",
    ]);
  });

  it("admits only Supervisor contexts with an active shift at an eligible exact location", async () => {
    const active = {
      activeShift: { locationId: location.locationId, shiftId: "44444444-4444-4444-8444-444444444444", startedAt: "2026-09-20T00:00:00Z", status: "ACTIVE" as const },
      currentLocation: null,
      eligibleLocations: [{ locationId: location.locationId, name: location.name, code: location.code, currency: location.currency, timezone: location.timezone }],
      membershipId: "33333333-3333-4333-8333-333333333333",
      organization: { organizationId: org.organizationId, name: org.name },
      role: "VALET_SUPERVISOR" as const,
    };
    const response = {
      contexts: [
        { ...active, role: "VALET_EMPLOYEE" as const },
        { ...active, membershipId: "55555555-5555-4555-8555-555555555555", activeShift: null },
        active,
      ],
    };
    const api = { request: vi.fn().mockResolvedValue(response) } as unknown as DashboardApiClient;

    const scopes = await listActiveSupervisorScopes(api);
    expect(scopes).toHaveLength(1);
    expect(scopes[0]).toMatchObject({ authority: "SUPERVISOR", location: { locationId: location.locationId } });
  });

  it("bounds selector page size with the canonical query schema", () => {
    expect(boundedSelectorPage({ limit: 100 }).limit).toBe(100);
    expect(() => boundedSelectorPage({ limit: 101 })).toThrow();
  });

  it("keeps CA and LM subscription recovery reads on their authority-specific routes", async () => {
    const request = vi.fn().mockResolvedValue({
      organizationId: org.organizationId,
      subscription: null,
    });
    const api = { request } as unknown as DashboardApiClient;

    await readCompanyAdminSubscription(api, org.organizationId);
    await readLocationManagerSubscription(api, location.locationId);

    expect(request.mock.calls[0]?.[0]).toBe(
      `/v1/staff/management/organizations/${org.organizationId}/subscription`,
    );
    expect(request.mock.calls[1]?.[0]).toBe(
      `/v1/staff/dashboard/locations/${location.locationId}/subscription`,
    );
  });

  it("aborts prior scope work and rejects late logical generations", () => {
    const guard = new ScopeGenerationGuard();
    const oldTicket = guard.begin();
    const currentTicket = guard.begin();

    expect(oldTicket.signal.aborted).toBe(true);
    expect(guard.accept(oldTicket, "stale")).toBeUndefined();
    expect(guard.accept(currentTicket, "current")).toBe("current");
    guard.invalidate();
    expect(currentTicket.signal.aborted).toBe(true);
    expect(guard.isCurrent(currentTicket)).toBe(false);
  });
});
