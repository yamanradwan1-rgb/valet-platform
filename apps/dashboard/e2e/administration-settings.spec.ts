import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

const configurationPath =
  `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/configuration`;
const overridePath = `${configurationPath}/override`;
const clearPath = `${overridePath}/clear`;
const initialUpdatedAt = "2026-09-21T08:00:00.000Z";
const setUpdatedAt = "2026-09-21T08:01:00.000Z";
const clearUpdatedAt = "2026-09-21T08:02:00.000Z";

function configuration(
  updatedAt: string,
  overridePresent: boolean,
  effective: boolean,
) {
  return {
    organizationId: ORG_A.organizationId,
    locationId: LOCATION_A.locationId,
    timezone: LOCATION_A.timezone,
    currency: LOCATION_A.currency,
    updatedAt,
    settings: [{
      setting: "tipsEnabled",
      default: true,
      overridePresent,
      override: overridePresent ? false : null,
      effective,
    }],
  };
}

test("LM keeps explicit false distinct from clearing the Location override", async ({ page }) => {
  let state = configuration(initialUpdatedAt, false, true);
  const writes: unknown[] = [];
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === configurationPath && request.method() === "GET") {
        return { body: state };
      }
      if (path === overridePath && request.method() === "PUT") {
        writes.push(request.postDataJSON());
        state = configuration(setUpdatedAt, true, false);
        return {
          body: {
            locationId: LOCATION_A.locationId,
            updatedAt: setUpdatedAt,
            result: state.settings[0],
          },
        };
      }
      if (path === clearPath && request.method() === "POST") {
        writes.push(request.postDataJSON());
        state = configuration(clearUpdatedAt, false, true);
        return {
          body: {
            locationId: LOCATION_A.locationId,
            updatedAt: clearUpdatedAt,
            result: state.settings[0],
          },
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/policies");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();

  const row = page.locator('[data-setting="tipsEnabled"]');
  await expect(row).toContainText("Inherited");
  await row.getByRole("combobox", { name: "Edit Tips enabled" }).selectOption("false");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row).toContainText("Overridden");
  await expect(row).toContainText("No");
  expect(writes[0]).toEqual({
    setting: "tipsEnabled",
    value: false,
    expectedUpdatedAt: initialUpdatedAt,
  });

  await row.getByRole("button", { name: "Clear override" }).click();
  await expect(row).toContainText("Inherited");
  await expect(row).toContainText("Yes");
  expect(writes[1]).toEqual({
    setting: "tipsEnabled",
    expectedUpdatedAt: setUpdatedAt,
  });
  await expect(page.locator('[data-setting="slaTargetSeconds"]')).toHaveCount(0);
});
