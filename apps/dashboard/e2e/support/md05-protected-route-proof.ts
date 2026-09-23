import { expect, type Page } from "@playwright/test";

import { DashboardApiFixture, LOCATION_A, ORG_A } from "./dashboard-api-fixture";
import { signInOnCurrentPage } from "./foundation-ui";
import {
  companyAnalyticsPath,
  companyContextPath,
  locationPaths,
  staleInactiveExactLocationContext,
} from "./md05-intelligence-fixtures";

export function expectNoLocationIntelligence(fixture: DashboardApiFixture) {
  for (const path of Object.values(locationPaths)) {
    expect(fixture.count(path)).toBe(0);
  }
}

export async function proveStaleInactiveSelectedScope(
  page: Page,
  path: "/overview" | "/payments",
  testId: "md05-overview-page" | "md05-payments-page",
) {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: staleInactiveExactLocationContext(),
  });
  await fixture.install(page);
  await page.goto(path);
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect.poll(() => fixture.count(companyContextPath)).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId(testId)).toHaveCount(0);
  expect(fixture.count(companyAnalyticsPath)).toBe(0);
  expectNoLocationIntelligence(fixture);
}
