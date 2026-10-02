import type { Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
  type DashboardFixtureOptions,
  type FixtureReply,
} from "./dashboard-api-fixture";
import { openPhysicalResources } from "./keys-spots";

export const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];
export const sessionId = "44444444-4444-4444-8444-444444444444";
const at = "2026-10-02T00:00:00.000Z";

export const resourcePath = (
  family: "keys" | "spots",
  locationId = LOCATION_A.locationId,
) =>
  `/v1/staff/dashboard/locations/${locationId}/${family === "keys" ? "overview/keys" : "physical-resources/parking-spots"}`;

export function keyPage(plate = "12345", nextCursor: string | null = null) {
  return {
    items: ids.map((keySlotId, index) => ({
      keySlotId,
      code: `K-${index}`,
      slotStatus: "ACTIVE",
      holdingSessionId: index === 0 ? null : sessionId,
      holdingVehicle:
        index === 0
          ? null
          : {
              plateNumberNormalized: index === 1 ? plate : null,
              temporaryDescriptor: index === 2 ? "سيارة زرقاء Blue" : null,
            },
    })),
    nextCursor,
  };
}

export function spotPage(
  plate = "12345",
  nextCursor: string | null = null,
  historical = false,
) {
  return {
    items: ids.map((parkingSpotId, index) => ({
      parkingSpotId,
      code: `P-${index}`,
      label: `Front ${index}`,
      status: index === 2 ? "INACTIVE" : "ACTIVE",
      parkingZone: {
        parkingZoneId: ids[0],
        code: "ZA",
        label: "Zone A",
        status: "ACTIVE",
      },
      createdAt: at,
      updatedAt: at,
      ...(historical
        ? {}
        : {
            occupancy:
              index === 0
                ? null
                : {
                    sessionId,
                    sessionState: "PARKED",
                    vehicle: {
                      plateNumberNormalized: index === 1 ? plate : null,
                      temporaryDescriptor:
                        index === 2 ? "سيارة زرقاء Blue" : null,
                    },
                  },
          }),
    })),
    nextCursor,
  };
}

export function resourceReply(path: string): FixtureReply | undefined {
  if (path.endsWith("/overview/keys")) return { body: keyPage() };
  if (path.endsWith("/physical-resources/parking-spots"))
    return { body: spotPage() };
  if (path.endsWith("/physical-resources/key-slots"))
    return { body: { items: [], nextCursor: null } };
  return undefined;
}

export function resourceFixture(
  override?: DashboardFixtureOptions["override"],
) {
  return new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: async (path, request, fixture) =>
      (await override?.(path, request, fixture)) ?? resourceReply(path),
  });
}

export async function openSpots(page: Page) {
  await openPhysicalResources(page);
  await page.getByRole("tab", { name: "Parking Spots", exact: true }).click();
}

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
