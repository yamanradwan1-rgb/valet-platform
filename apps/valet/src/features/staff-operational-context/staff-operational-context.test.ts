import type { StaffOperationalContextResponse } from "@valet/contracts";
import { describe, expect, it, vi } from "vitest";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { fetchStaffOperationalContext } from "./staff-operational-context-api";
import { resolveOperationalScope } from "./staff-operational-context-resolver";

describe("Staff Operational Context", () => {
  describe("resolveOperationalScope", () => {
    it("resolves exact scope when exactly one active shift exists", () => {
      const response: StaffOperationalContextResponse = {
        contexts: [
          {
            membershipId: "11111111-1111-4111-8111-111111111111",
            role: "VALET_EMPLOYEE",
            organization: {
              organizationId: "22222222-2222-4222-8222-222222222222",
              name: "Apex Valet Services",
            },
            activeShift: {
              shiftId: "33333333-3333-4333-8333-333333333333",
              locationId: "44444444-4444-4444-8444-444444444444",
              startedAt: "2026-08-21T18:00:00.000Z",
              status: "ACTIVE",
            },
            currentLocation: {
              locationId: "44444444-4444-4444-8444-444444444444",
              name: "Grand Hotel",
              code: "GH-MAIN",
            },
            eligibleLocations: [
              {
                locationId: "44444444-4444-4444-8444-444444444444",
                name: "Grand Hotel",
                code: "GH-MAIN",
              },
            ],
          },
        ],
      };

      const result = resolveOperationalScope(response);
      expect(result.kind).toBe("RESOLVED");
      if (result.kind === "RESOLVED") {
        expect(result.scope.locationId).toBe(
          "44444444-4444-4444-8444-444444444444",
        );
        expect(result.scope.locationName).toBe("Grand Hotel");
        expect(result.scope.locationCode).toBe("GH-MAIN");
        expect(result.scope.membershipId).toBe(
          "11111111-1111-4111-8111-111111111111",
        );
        expect(result.scope.organizationId).toBe(
          "22222222-2222-4222-8222-222222222222",
        );
        expect(result.scope.organizationName).toBe("Apex Valet Services");
        expect(result.scope.role).toBe("VALET_EMPLOYEE");
        expect(result.scope.shiftId).toBe(
          "33333333-3333-4333-8333-333333333333",
        );
        expect(result.scope.shiftStartedAt).toBe("2026-08-21T18:00:00.000Z");
      }
    });

    it("returns NO_ACTIVE_SHIFT when activeShift is null", () => {
      const response: StaffOperationalContextResponse = {
        contexts: [
          {
            membershipId: "11111111-1111-4111-8111-111111111111",
            role: "VALET_EMPLOYEE",
            organization: {
              organizationId: "22222222-2222-4222-8222-222222222222",
              name: "Apex Valet Services",
            },
            activeShift: null,
            currentLocation: null,
            eligibleLocations: [
              {
                locationId: "44444444-4444-4444-8444-444444444444",
                name: "Grand Hotel",
                code: "GH-MAIN",
              },
            ],
          },
        ],
      };

      const result = resolveOperationalScope(response);
      expect(result.kind).toBe("NO_ACTIVE_SHIFT");
    });

    it("returns NO_ACTIVE_SHIFT when contexts array is empty", () => {
      const response: StaffOperationalContextResponse = {
        contexts: [],
      };

      const result = resolveOperationalScope(response);
      expect(result.kind).toBe("NO_ACTIVE_SHIFT");
    });

    it("returns AMBIGUOUS_ACTIVE_SHIFTS when multiple active shifts exist", () => {
      const response: StaffOperationalContextResponse = {
        contexts: [
          {
            membershipId: "11111111-1111-4111-8111-111111111111",
            role: "VALET_EMPLOYEE",
            organization: {
              organizationId: "22222222-2222-4222-8222-222222222222",
              name: "Org A",
            },
            activeShift: {
              shiftId: "33333333-3333-4333-8333-333333333333",
              locationId: "44444444-4444-4444-8444-444444444444",
              startedAt: "2026-08-21T18:00:00.000Z",
              status: "ACTIVE",
            },
            currentLocation: {
              locationId: "44444444-4444-4444-8444-444444444444",
              name: "Location A",
              code: "LOC-A",
            },
            eligibleLocations: [],
          },
          {
            membershipId: "55555555-5555-4555-8555-555555555555",
            role: "VALET_SUPERVISOR",
            organization: {
              organizationId: "66666666-6666-4666-8666-666666666666",
              name: "Org B",
            },
            activeShift: {
              shiftId: "77777777-7777-4777-8777-777777777777",
              locationId: "88888888-8888-4888-8888-888888888888",
              startedAt: "2026-08-21T19:00:00.000Z",
              status: "ACTIVE",
            },
            currentLocation: {
              locationId: "88888888-8888-4888-8888-888888888888",
              name: "Location B",
              code: "LOC-B",
            },
            eligibleLocations: [],
          },
        ],
      };

      const result = resolveOperationalScope(response);
      expect(result.kind).toBe("AMBIGUOUS_ACTIVE_SHIFTS");
      if (result.kind === "AMBIGUOUS_ACTIVE_SHIFTS") {
        expect(result.count).toBe(2);
      }
    });
  });

  describe("fetchStaffOperationalContext API", () => {
    it("requests endpoint with auth and parses valid response", async () => {
      const mockPayload: StaffOperationalContextResponse = {
        contexts: [
          {
            membershipId: "11111111-1111-4111-8111-111111111111",
            role: "VALET_EMPLOYEE",
            organization: {
              organizationId: "22222222-2222-4222-8222-222222222222",
              name: "Apex Valet",
            },
            activeShift: null,
            currentLocation: null,
            eligibleLocations: [],
          },
        ],
      };

      const mockClient = {
        request: vi.fn().mockResolvedValue(mockPayload),
      } as unknown as EmployeeApiClient;

      const res = await fetchStaffOperationalContext(mockClient);
      expect(res).toEqual(mockPayload);
      expect(mockClient.request).toHaveBeenCalledWith(
        "/v1/staff/operational-context",
        {
          method: "GET",
          signal: undefined,
          requireAuth: true,
        },
      );
    });

    it("rejects invalid payload violating schema", async () => {
      const invalidPayload = {
        contexts: [
          {
            membershipId: "invalid-uuid",
          },
        ],
      };

      const mockClient = {
        request: vi.fn().mockResolvedValue(invalidPayload),
      } as unknown as EmployeeApiClient;

      await expect(fetchStaffOperationalContext(mockClient)).rejects.toThrow();
    });
  });
});
