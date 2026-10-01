import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  enterPhysicalResources,
  openPhysicalResources,
  switchTopbarLocation,
} from "./support/keys-spots";
import {
  Issue236ZoneState,
  openSpot,
  zonePath,
} from "./support/issue236-parking-zones";

for (const failure of [false, true]) {
  test(`A→B→A fences old zone-selector ${failure ? "failure" : "success"}`, async ({
    page,
  }) => {
    const state = new Issue236ZoneState();
    let release!: () => void;
    const wait = new Promise<void>((done) => {
      release = done;
    });
    let reads = 0;
    const api = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
      override: async (path, request) => {
        if (path === zonePath && request.method() === "GET") {
          reads++;
          if (reads === 1) {
            await wait;
            return failure
              ? {
                  status: 503,
                  body: {
                    code: "SERVICE_UNAVAILABLE",
                    message: "OLD-ZONE-ERROR",
                    requestId: "old",
                  },
                }
              : {
                  body: {
                    items: [
                      {
                        parkingZoneId: "99999999-9999-4999-8999-999999999999",
                        code: "OLD-ZONE",
                        label: "Old Zone",
                        status: "ACTIVE",
                      },
                    ],
                    nextCursor: null,
                  },
                };
          }
          return {
            body: {
              items: [
                {
                  parkingZoneId: "88888888-8888-4888-8888-888888888888",
                  code: "CURRENT-ZONE",
                  label: "Current Zone",
                  status: "ACTIVE",
                },
              ],
              nextCursor: null,
            },
          };
        }
        if (
          path.includes(LOCATION_B.locationId) &&
          path.includes("physical-resources")
        )
          return { body: { items: [], nextCursor: null } };
        return state.reply(path, request);
      },
    });
    await api.install(page);
    await enterPhysicalResources(page);
    await page.getByRole("tab", { name: "Parking Spots" }).click();
    await page.getByRole("button", { name: "Add Parking Spot" }).click();
    await expect.poll(() => reads).toBe(1);
    await page
      .getByRole("dialog", { name: "Add Parking Spot" })
      .press("Escape");
    await switchTopbarLocation(page, LOCATION_B.name);
    await openPhysicalResources(page);
    const b = await openSpot(page);
    await expect(b.getByLabel("Parking Zone").locator("option")).toHaveCount(1);
    await b.press("Escape");
    await switchTopbarLocation(page, LOCATION_A.name);
    await openPhysicalResources(page);
    const current = await openSpot(page);
    await expect(
      current
        .getByLabel("Parking Zone")
        .locator("option", { hasText: "Current Zone" }),
    ).toHaveCount(1);
    release();
    await page.waitForTimeout(200);
    await expect(
      current
        .getByLabel("Parking Zone")
        .locator("option", { hasText: "Old Zone" }),
    ).toHaveCount(0);
    await expect(current.getByRole("alert")).toHaveCount(0);
    expect(reads).toBe(2);
  });
}
