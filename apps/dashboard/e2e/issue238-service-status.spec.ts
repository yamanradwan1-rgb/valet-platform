import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  companySettings,
  locationManagerConfiguration,
} from "./support/administration-fixtures";
import { signInOnCurrentPage } from "./support/foundation-ui";

const statusPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/integrations`;

test("Legacy Service Status bookmark resolves to the approved Studio without status UI", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path) => {
      if (path.endsWith("/settings")) return { body: companySettings() };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/policies?tab=services");
  await expect(page).toHaveURL(/\/policies$/u);
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", { name: "All Locations", exact: true })
    .click();
  await expect(page.locator(".ps-workspace")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vehicle operations" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Company defaults" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Service Status" })).toHaveCount(0);
  expect(fixture.count(statusPath)).toBe(0);
  await expect(
    page.getByRole("link", { name: "Integrations", exact: true }),
  ).toHaveCount(0);
  await page.goto("/integrations");
  await expect(page).toHaveURL(/\/policies$/u);
  await expect(page.locator(".ps-workspace")).toBeVisible();
  expect(fixture.count(statusPath)).toBe(0);
});

test("Location Manager legacy integration bookmark reaches only authorized Studio sections", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) =>
      path.endsWith("/configuration")
        ? { body: locationManagerConfiguration() }
        : undefined,
  });
  await fixture.install(page);
  await page.goto("/integrations");
  await expect(page).toHaveURL(/\/policies$/u);
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(
    page.getByRole("heading", { name: "Policies & Settings" }),
  ).toBeVisible();
  await expect(page.locator(".ps-workspace")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vehicle operations" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Service Status" })).toHaveCount(
    0,
  );
  expect(fixture.count(statusPath)).toBe(0);
});
