import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { readManagementAudit } from "./audit-api";

const org = "11111111-1111-4111-8111-111111111111";
const location = "22222222-2222-4222-8222-222222222222";

describe("Management Audit API selection", () => {
  it("uses Organization Audit only for Organization scope", async () => {
    const request = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const api = { request } as unknown as DashboardApiClient;
    await readManagementAudit(api, {
      kind: "ORGANIZATION", organizationId: org, role: "COMPANY_ADMIN",
    }, { cursor: "abcdefgh", eventType: "STAFF_ROLE_CHANGED" });
    expect(request.mock.calls[0]?.[0]).toBe(
      `/v1/staff/management/organizations/${org}/audit-events`,
    );
    expect(request.mock.calls[0]?.[2]?.query).toEqual({
      cursor: "abcdefgh", eventType: "STAFF_ROLE_CHANGED", limit: 50,
    });
  });

  it.each(["COMPANY_ADMIN", "LOCATION_MANAGER", "SUPERVISOR"] as const)(
    "uses exact Location Audit for %s",
    async (role) => {
      const request = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
      const api = { request } as unknown as DashboardApiClient;
      await readManagementAudit(api, {
        kind: "LOCATION", locationId: location, organizationId: org, role,
      }, { cursor: null, eventType: null });
      expect(request.mock.calls[0]?.[0]).toBe(
        `/v1/staff/management/organizations/${org}/locations/${location}/audit-events`,
      );
      expect(request.mock.calls[0]?.[2]?.query).toEqual({ limit: 50 });
    },
  );
});
