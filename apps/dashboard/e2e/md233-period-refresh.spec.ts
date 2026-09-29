import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  companyAnalytics,
  companyAnalyticsPath,
} from "./support/md05-intelligence-fixtures";

test("same-selection refresh keeps the valid snapshot until its replacement arrives", async ({
  page,
}) => {
  let reads = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path !== companyAnalyticsPath) return undefined;
      reads += 1;
      return {
        body: companyAnalytics(request, reads === 1 ? 7 : 11),
        ...(reads === 2 ? { delayMs: 700 } : {}),
      };
    },
  });
  await fixture.install(page);
  await page.addInitScript(() => {
    Date.now = () => Date.parse("2026-09-28T21:30:00Z");
  });
  await page.goto("/overview");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  const firstValue = page
    .getByTestId("md05-overview-page")
    .locator('[class*="metricCard"] [class*="metricValue"]')
    .first();
  await expect(firstValue).toHaveText("7");
  await page.getByRole("button", { name: "Refresh period" }).click();
  await expect.poll(() => reads).toBe(2);
  await expect(page.getByRole("status")).toHaveText("Refreshing period…");
  await expect(firstValue).toHaveText("7");
  await expect(firstValue).toHaveText("11");
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(fixture.count(companyAnalyticsPath)).toBe(2);
});

test("activating Today after Custom crosses midnight without an obsolete read", async ({
  page,
}) => {
  const seen: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path !== companyAnalyticsPath) return undefined;
      seen.push(new URL(request.url()).search);
      return { body: companyAnalytics(request) };
    },
  });
  await fixture.install(page);
  await page.addInitScript(() => {
    Date.now = () => Date.parse("2026-09-28T21:30:00Z");
  });
  await page.goto("/overview");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect.poll(() => seen).toEqual(["?from=2026-09-29&to=2026-09-29"]);
  await page.getByRole("button", { name: "Custom" }).click();
  const dialog = page.getByRole("dialog", { name: "Select analytics period" });
  await dialog.getByLabel("From").fill("2026-09-01");
  await dialog.getByLabel("To").fill("2026-09-07");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect.poll(() => seen).toHaveLength(2);
  await page.evaluate(() => {
    Date.now = () => Date.parse("2026-09-29T21:30:00Z");
  });
  await page.getByRole("button", { name: "Today" }).click();
  await expect.poll(() => seen).toHaveLength(3);
  expect(seen).toEqual([
    "?from=2026-09-29&to=2026-09-29",
    "?from=2026-09-01&to=2026-09-07",
    "?from=2026-09-30&to=2026-09-30",
  ]);
});
