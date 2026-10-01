import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

async function enterCompanyLocation(page: Page, fixture: DashboardApiFixture) {
  await fixture.install(page);
  await page.goto("/help");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.locator(".topbar .location-context")).toContainText(
    LOCATION_A.name,
  );
}

async function openMenu(page: Page) {
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope", exact: true })
    .click();
  await expect(
    page.getByRole("listbox", { name: "Select location" }),
  ).toBeVisible();
}

test("Security keeps the shell and route while the topbar switches Location in-place", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    mfaState: "ASSURED",
    override: (path, request) => {
      if (path !== "/v1/staff/dashboard/feature-authority") return undefined;
      const url = new URL(request.url());
      const feature = url.searchParams.get("feature");
      const locationId = url.searchParams.get("locationId");
      if (
        feature !== "MANAGEMENT_AUDIT" ||
        locationId !== LOCATION_A.locationId
      ) {
        return undefined;
      }
      return {
        body: {
          feature,
          organizationId: ORG_A.organizationId,
          role: "ORG_ADMIN",
          scope: { kind: "LOCATION", locationId },
        },
      };
    },
  });
  await enterCompanyLocation(page, fixture);
  await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Audit Log" })).toBeVisible();
  await page.getByRole("link", { name: "Security", exact: true }).click();
  await expect(page).toHaveURL(/\/security$/u);
  await page
    .locator(".shell")
    .evaluate((node) => node.setAttribute("data-task02-security", "mounted"));

  await openMenu(page);
  await page.getByRole("option", { name: LOCATION_B.name }).click();
  await expect(page).toHaveURL(/\/security$/u);
  await expect(page.locator(".topbar .location-context")).toContainText(
    LOCATION_B.name,
  );
  await expect(
    page.locator('.shell[data-task02-security="mounted"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Security", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Audit Log" })).toHaveCount(0);

  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page).toHaveURL(/\/overview$/u);
  await expect(page.locator(".topbar .location-context")).toContainText(
    LOCATION_B.name,
  );

  await page.getByRole("link", { name: "Security", exact: true }).click();
  await expect(page).toHaveURL(/\/security$/u);
  await page.locator(".sidebar-scope").click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(
    page.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toBeVisible();
});
