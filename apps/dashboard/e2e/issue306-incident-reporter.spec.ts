import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { incidentItem } from "./support/operations-fixtures";
import { r08Path } from "./support/r08-accountability";

test("#306 displays only the authorized Location reporter when manager switches locations", async ({ page }, testInfo) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path) => {
      if (path === r08Path("incidents", LOCATION_A.locationId)) {
        return { body: {
          items: [{ ...incidentItem(), reporterDisplayName: "Reporter Location Alpha" }],
          nextCursor: null,
        } };
      }
      if (path === r08Path("incidents", LOCATION_B.locationId)) {
        return { body: {
          items: [{ ...incidentItem(), reporterDisplayName: "Reporter Location Beta" }],
          nextCursor: null,
        } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/incidents");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name, exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.locator("tbody tr").first().getByRole("button").click();
  await expect(page.getByRole("dialog")).toContainText("Reporter Location Alpha");
  await page.screenshot({ path: testInfo.outputPath("location-a-reporter.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Change scope", exact: true }).click();
  await page.getByRole("option", { name: LOCATION_B.name }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("table")).toBeVisible();
  await page.locator("tbody tr").first().getByRole("button").click();
  await expect(page.getByRole("dialog")).toContainText("Reporter Location Beta");
  await expect(page.locator("body")).not.toContainText("Reporter Location Alpha");
  await page.screenshot({ path: testInfo.outputPath("location-b-reporter.png") });
});
