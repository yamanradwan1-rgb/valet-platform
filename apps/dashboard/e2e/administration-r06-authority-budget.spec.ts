import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  employeeContext,
  supervisorContext,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { persistentMatches } from "./support/persistent-storage";
import { subscriptionState } from "./support/fixture-data";
import {
  enterLocations,
  lifecyclePath,
  locationLifecycle,
  locationsPath,
  selectLocation,
} from "./support/r06-locations";

test("CA selected detail is private with settled bounded requests and no row fan-out", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path) =>
      path === lifecyclePath ? { body: locationLifecycle() } : undefined,
  });
  await fixture.install(page);
  await enterLocations(page);
  expect(fixture.count(lifecyclePath)).toBe(0);
  await selectLocation(page);
  await expect(page.getByText("R06 protected address sentinel")).toBeVisible();
  const counts = Object.fromEntries(fixture.counts);
  // Intentional settled request-budget window, never used to synchronize UI.
  await page.waitForTimeout(1200);
  expect(Object.fromEntries(fixture.counts)).toEqual(counts);
  expect(fixture.count(lifecyclePath)).toBe(1);
  expect(
    fixture.count(`${locationsPath}/${LOCATION_B.locationId}/lifecycle`),
  ).toBe(0);
  expect(fixture.count(locationsPath)).toBeLessThanOrEqual(3);
  expect(
    await persistentMatches(page, "R06 protected address sentinel"),
  ).toEqual({ local: [], session: [], indexed: [], cache: [] });
});

test("LM shows only granted scope fields with zero CA enumeration or lifecycle requests", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
  await fixture.install(page);
  await page.goto("/locations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  const detail = page.getByTestId("location-detail");
  await expect(
    detail.getByRole("heading", { name: LOCATION_A.name }),
  ).toBeVisible();
  for (const fact of ["MAIN", "Asia/Amman", "JOD"])
    await expect(detail.getByText(fact, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Add Location|Activate|Stop intake|Deactivate|Save/,
    }),
  ).toHaveCount(0);
  await expect(detail.getByText(/address|R06 protected/)).toHaveCount(0);
  expect(
    [...fixture.counts.keys()].filter((path) => path.startsWith(locationsPath)),
  ).toEqual([]);
});

for (const role of ["supervisor", "employee", "guest", "unauthenticated"]) {
  test(`${role} cannot read Locations business data`, async ({ page }) => {
    const fixture = new DashboardApiFixture({
      operationalContexts:
        role === "supervisor"
          ? [supervisorContext()]
          : role === "employee"
            ? [employeeContext()]
            : [],
    });
    await fixture.install(page);
    await page.goto("/locations");
    if (role !== "unauthenticated") await signInOnCurrentPage(page);
    else
      await expect(
        page.getByRole("heading", { name: "Sign in" }),
      ).toBeVisible();
    await expect(page.getByTestId("md02-page")).toHaveCount(0);
    expect(fixture.count(locationsPath)).toBe(0);
    expect(fixture.count(lifecyclePath)).toBe(0);
  });
}

test("Dashboard entitlement denial prevents Locations business reads", async ({
  page,
}) => {
  const subscription = subscriptionState();
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) =>
      path.endsWith("/subscription")
        ? {
            body: {
              organizationId: ORG_A.organizationId,
              subscription: {
                ...subscription,
                entitlements: {
                  ...subscription.entitlements,
                  dashboardAccess: false,
                },
              },
            },
          }
        : undefined,
  });
  await fixture.install(page);
  await page.goto("/locations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await expect(
    page.getByText(
      "Management Dashboard access is unavailable for this authorized scope.",
    ),
  ).toBeVisible();
  expect(fixture.count(locationsPath)).toBe(0);
  expect(fixture.count(lifecyclePath)).toBe(0);
  await expect(
    page.getByRole("button", { name: "Add Location", exact: true }),
  ).toHaveCount(0);
});
