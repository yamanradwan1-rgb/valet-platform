import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  companySettings,
  integrationsProjection,
  locationManagerConfiguration,
} from "./support/administration-fixtures";
import { signInOnCurrentPage } from "./support/foundation-ui";

const statusPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/integrations`;

test("Company Settings lazily reads Service Status and preserves compatibility navigation", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path) => {
      if (path === statusPath) return { body: integrationsProjection() };
      if (path.endsWith("/settings")) return { body: companySettings() };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/policies");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", { name: "All Locations", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Company defaults", exact: true }),
  ).toBeVisible();
  expect(fixture.count(statusPath)).toBe(0);
  await expect(
    page.getByRole("link", { name: "Integrations", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("tab", { name: "Location overrides", exact: true })
    .click();
  expect(fixture.count(statusPath)).toBe(0);
  await page.getByRole("tab", { name: "Service Status", exact: true }).click();
  await expect(page.getByText("Unknown", { exact: true })).toBeVisible();
  expect(fixture.count(statusPath)).toBe(1);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect.poll(() => fixture.count(statusPath)).toBe(2);
  await page.goto("/integrations");
  await expect(page).toHaveURL(/\/policies\?tab=services$/u);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", { name: "All Locations", exact: true })
    .click();
  await expect(page.getByText("Unknown", { exact: true })).toBeVisible();
  expect(fixture.count(statusPath)).toBe(3);
  await page.screenshot({
    path: "test-results/issue238-service-status-en.png",
    fullPage: true,
  });
});

test("Location Manager compatibility bookmark retains Settings without a status probe", async ({
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
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(
    page.getByRole("heading", { name: "Policies & Settings" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Service Status" })).toHaveCount(
    0,
  );
  expect(fixture.count(statusPath)).toBe(0);
});
