import { describe, expect, it } from "vitest";
import type { StaffOperationalContextResponse } from "@valet/contracts";

import { selectStartableLocations } from "./select-startable-locations";

function location(
  locationId: string,
  code: string,
): StaffOperationalContextResponse["contexts"][number]["eligibleLocations"][number] {
  return {
    code,
    currency: "JOD",
    locationId,
    name: `Location ${code}`,
    timezone: "Asia/Amman",
  };
}

function contextWith(
  eligibleLocations: ReturnType<typeof location>[],
): StaffOperationalContextResponse {
  return {
    contexts: [
      {
        activeShift: null,
        currentLocation: null,
        eligibleLocations,
        membershipId: "11111111-1111-4111-8111-111111111111",
        organization: {
          name: "Apex Valet",
          organizationId: "22222222-2222-4222-8222-222222222222",
        },
        role: "VALET_EMPLOYEE",
      },
    ],
  };
}

describe("VUI-011D authoritative startable Locations selection", () => {
  it("returns the server-provided eligibleLocations projection unchanged", () => {
    const response = contextWith([
      location("44444444-4444-4444-8444-444444444444", "AMM-01"),
      location("55555555-5555-4555-8555-555555555555", "DEM-01"),
    ]);

    expect(selectStartableLocations(response)).toEqual(
      response.contexts[0]!.eligibleLocations,
    );
  });

  it("deduplicates one Location reachable through several memberships by ID", () => {
    const shared = location(
      "44444444-4444-4444-8444-444444444444",
      "AMM-01",
    );
    const other = location("55555555-5555-4555-8555-555555555555", "DEM-01");
    const response: StaffOperationalContextResponse = {
      contexts: [
        {
          ...contextWith([shared]).contexts[0]!,
          membershipId: "11111111-1111-4111-8111-111111111111",
        },
        {
          ...contextWith([shared, other]).contexts[0]!,
          membershipId: "66666666-6666-4666-8666-666666666666",
        },
      ],
    };

    const selected = selectStartableLocations(response);
    expect(selected).toHaveLength(2);
    expect(selected.map((entry) => entry.locationId)).toEqual([
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    ]);
  });

  it("yields no fabricated Location without an authoritative response", () => {
    expect(selectStartableLocations(null)).toEqual([]);
    expect(selectStartableLocations(undefined)).toEqual([]);
    expect(selectStartableLocations({ contexts: [] })).toEqual([]);
    expect(selectStartableLocations(contextWith([]))).toEqual([]);
  });
});
