import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  enterLocations,
  lifecyclePath,
  locationLifecycle,
  selectLocation,
} from "./support/r06-locations";

for (const blocker of [
  "activeShiftPresent",
  "nonCompletedValetSessionPresent",
  "nonTerminalTaskPresent",
] as const) {
  test(`drain exposes only the real ${blocker} blocker`, async ({ page }) => {
    const current = locationLifecycle({
      status: "ACTIVE",
      drain: {
        blocked: true,
        activeShiftPresent: false,
        nonCompletedValetSessionPresent: false,
        nonTerminalTaskPresent: false,
        [blocker]: true,
      },
    });
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path) =>
        path === lifecyclePath ? { body: current } : undefined,
    });
    await fixture.install(page);
    await enterLocations(page);
    await selectLocation(page);
    const drain = page
      .getByRole("heading", { name: "Drain status", exact: true })
      .locator("..");
    for (const [key, label] of Object.entries({
      activeShiftPresent: "Active shift",
      nonCompletedValetSessionPresent: "Non-completed session",
      nonTerminalTaskPresent: "Non-terminal task",
    })) {
      await expect(drain).toContainText(
        `${label}: ${key === blocker ? "Enabled" : "Disabled"}`,
      );
    }
    await expect(
      page.getByRole("button", { name: "Deactivate", exact: true }),
    ).toBeDisabled();
    for (const save of await page
      .getByRole("button", { name: "Save", exact: true })
      .all())
      await expect(save).toBeDisabled();
  });
}

test("readiness false blocks activation and read failure has an explicit retry", async ({
  page,
}) => {
  let reads = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path !== lifecyclePath) return undefined;
      reads++;
      return reads === 1
        ? {
            status: 503,
            body: {
              code: "UNAVAILABLE",
              message: "Lifecycle temporarily unavailable.",
              requestId: "r06-read",
            },
          }
        : {
            body: locationLifecycle({
              readiness: {
                readyForActivation: false,
                checks: { currencySupported: false, timezoneValid: true },
              },
            }),
          };
    },
  });
  await fixture.install(page);
  await enterLocations(page);
  await page
    .getByTestId("location-master")
    .getByRole("button", { name: /Main Garage/ })
    .click();
  await expect(
    page.getByTestId("location-detail").getByRole("alert"),
  ).toContainText("Lifecycle temporarily unavailable.");
  expect(reads).toBe(1);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Activate", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/Supported currency: Disabled/)).toBeVisible();
  expect(reads).toBe(2);
});
