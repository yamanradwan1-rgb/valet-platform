import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { readCompanyBranding, setManagementLocationBranding } from "./branding/branding-api";
import { readCompanySubscription, readIntegrations, readLocationSubscription } from "./commercial/commercial-api";
import { commandLocationLifecycle, createLocation, correctLocationTimezone, readLocations } from "./locations/locations-api";
import { clearLocationManagerSetting, readCompanySettings, readLocationManagerSettings, setCompanySetting } from "./settings/settings-api";
import { changeStaffLocationAccess, readActiveShifts, readStaffDirectory, setStaffRole } from "./staff/staff-api";

function client() {
  const request = vi.fn().mockResolvedValue({});
  return { api: { request } as unknown as DashboardApiClient, request };
}

function call(request: ReturnType<typeof vi.fn>, index = 0) {
  const [path, , options] = request.mock.calls[index]!;
  return { path, options: options ?? {} };
}

describe("MD-02 backend route mapping", () => {
  it("uses cursor staff reads and expectedVersion staff mutations without a create route", () => {
    const { api, request } = client();
    void readStaffDirectory(api, "org", "cursor", undefined);
    void setStaffRole(api, "org", "member", "LOCATION_MANAGER", 7);
    void changeStaffLocationAccess(api, "org", "member", "location", 8, "grant");
    expect(call(request, 0)).toMatchObject({ path: "/v1/staff/management/organizations/org/staff", options: { query: { cursor: "cursor", limit: 50 } } });
    expect(call(request, 1)).toMatchObject({ path: "/v1/staff/management/organizations/org/staff/member/role", options: { method: "POST", body: { expectedVersion: 7, role: "LOCATION_MANAGER" } } });
    expect(call(request, 2)).toMatchObject({ path: "/v1/staff/management/organizations/org/staff/member/location-access/grant", options: { method: "POST", body: { expectedVersion: 8, locationIds: ["location"] } } });
    expect(request.mock.calls.every(([path]) => !String(path).endsWith("/staff/create"))).toBe(true);
  });

  it("reads shifts only from the exact Location overview and never sends a shift mutation", () => {
    const { api, request } = client();
    void readActiveShifts(api, "location", null, undefined);
    expect(call(request)).toMatchObject({ path: "/v1/staff/dashboard/locations/location/overview/active-shifts", options: { query: { cursor: null, limit: 50 } } });
    expect(call(request).options.method).toBeUndefined();
  });

  it("preserves caller-owned Location operationId and lifecycle concurrency tokens", () => {
    const { api, request } = client();
    const create = { operationId: "11111111-1111-4111-8111-111111111111", name: "Garage", code: "GARAGE", addressText: "Address", timezone: "Asia/Amman", currency: "JOD" };
    void createLocation(api, "org", create);
    void commandLocationLifecycle(api, "org", "location", "stop-intake", "2026-09-21T00:00:00Z");
    void correctLocationTimezone(api, "org", "location", { expectedUpdatedAt: "2026-09-21T00:00:00Z", newTimezone: "Asia/Dubai", reason: "Correction" });
    expect(call(request, 0)).toMatchObject({ path: "/v1/staff/management/organizations/org/locations", options: { method: "POST", body: create } });
    expect(call(request, 1)).toMatchObject({ path: "/v1/staff/management/organizations/org/locations/location/stop-intake", options: { method: "POST", body: { expectedUpdatedAt: "2026-09-21T00:00:00Z" } } });
    expect(call(request, 2).options.body).toMatchObject({ newTimezone: "Asia/Dubai", reason: "Correction" });
  });

  it("keeps Company management settings distinct from LM legacy configuration", () => {
    const { api, request } = client();
    void readCompanySettings(api, "org", undefined);
    void setCompanySetting(api, "org", { setting: "tipsEnabled", value: false, expectedUpdatedAt: "2026-09-21T00:00:00Z" });
    void readLocationManagerSettings(api, "location", undefined);
    void clearLocationManagerSetting(api, "location", { setting: "tipsEnabled", expectedUpdatedAt: "2026-09-21T00:00:00Z" });
    expect(call(request, 0).path).toBe("/v1/staff/management/organizations/org/settings");
    expect(call(request, 1)).toMatchObject({ path: "/v1/staff/management/organizations/org/settings/default", options: { method: "PUT", body: { setting: "tipsEnabled", value: false } } });
    expect(call(request, 2).path).toBe("/v1/staff/dashboard/locations/location/configuration");
    expect(call(request, 3).path).toBe("/v1/staff/dashboard/locations/location/configuration/override/clear");
  });

  it("uses only real Branding CAS routes", () => {
    const { api, request } = client();
    void readCompanyBranding(api, "org", undefined);
    void setManagementLocationBranding(api, "org", "location", { setting: "brandPrimaryColor", value: "#1E60F0", expectedUpdatedAt: "2026-09-21T00:00:00Z" });
    expect(call(request, 0).path).toBe("/v1/staff/management/organizations/org/branding");
    expect(call(request, 1)).toMatchObject({ path: "/v1/staff/management/organizations/org/locations/location/branding/override", options: { method: "PUT" } });
    expect(call(request, 1).options.body).toEqual({ setting: "brandPrimaryColor", value: "#1E60F0", expectedUpdatedAt: "2026-09-21T00:00:00Z" });
  });

  it("keeps subscription reads separate from D-gated integrations and exposes no commercial mutation", () => {
    const { api, request } = client();
    void readCompanySubscription(api, "org", undefined);
    void readLocationSubscription(api, "location", undefined);
    void readIntegrations(api, "org", undefined);
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      "/v1/staff/management/organizations/org/subscription",
      "/v1/staff/dashboard/locations/location/subscription",
      "/v1/staff/management/organizations/org/integrations",
    ]);
    expect(request.mock.calls.every(([, , options]) => options?.method === undefined)).toBe(true);
  });

  it("uses bounded Organization Location enumeration", () => {
    const { api, request } = client();
    void readLocations(api, "org", null, undefined);
    expect(call(request)).toMatchObject({ path: "/v1/staff/management/organizations/org/locations", options: { query: { cursor: null, limit: 50 } } });
  });
});
