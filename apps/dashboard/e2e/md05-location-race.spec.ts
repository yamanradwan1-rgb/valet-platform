import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { applyAnalyticsPeriod } from "./support/md05-analytics-fixtures";
import {
  locationIntelligenceReply,
  locationPathsFor,
  PERIOD_A,
} from "./support/md05-intelligence-fixtures";

async function changeLocation(page: Page, locationName: string) {
  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: locationName }).click();
}

async function expectMarker(page: Page, marker: string) {
  await expect(page.getByTestId("analytics-metric-card").first()).toContainText(marker);
}

function raceFixture(failFirstA: boolean) {
  const aPaths = locationPathsFor(LOCATION_A.locationId);
  const bPaths = locationPathsFor(LOCATION_B.locationId);
  const aCounts = new Map<string, number>();
  const urls: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path, request) => {
      const aPath = Object.values(aPaths).includes(path as never);
      const bPath = Object.values(bPaths).includes(path as never);
      if (!aPath && !bPath) return undefined;
      if (path.includes("/analytics/") && !path.endsWith("/queue")) {
        const url = new URL(request.url());
        urls.push(`${url.pathname}${url.search}`);
      }
      if (bPath) return locationIntelligenceReply(path, request, 17, LOCATION_B);
      const count = (aCounts.get(path) ?? 0) + 1;
      aCounts.set(path, count);
      if (path === aPaths.operations && count === 1 && failFirstA) {
        return {
          status: 503,
          delayMs: 800,
          body: { code: "UNAVAILABLE", message: "stale A failure", requestId: "stale-a" },
        };
      }
      const reply = locationIntelligenceReply(path, request, count === 1 ? 91 : 23, LOCATION_A);
      return path === aPaths.operations && count === 1 && reply
        ? { ...reply, delayMs: 800 }
        : reply;
    },
  });
  return { aPaths, bPaths, fixture, urls };
}

for (const [label, failFirstA] of [
  ["success", false],
  ["failure", true],
] as const) {
  test(`Location A to B to A fences stale first-A ${label}`, async ({ page }) => {
    const { aPaths, bPaths, fixture, urls } = raceFixture(failFirstA);
    await fixture.install(page);
    await page.goto("/analytics");
    await signInOnCurrentPage(page);
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page.getByRole("button", { name: LOCATION_A.name }).click();
    await applyAnalyticsPeriod(page);
    await expect.poll(() => fixture.count(aPaths.operations)).toBe(1);

    await changeLocation(page, LOCATION_B.name);
    await expectMarker(page, "17");
    await changeLocation(page, LOCATION_A.name);
    await expectMarker(page, "23");
    await page.waitForTimeout(900);
    await expectMarker(page, "23");
    await expect(page.getByText("91", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);

    for (const path of [aPaths.operations, aPaths.financial, aPaths.incidents, aPaths.kpis]) {
      expect(fixture.count(path)).toBe(2);
      expect(urls.filter((url) => url === `${path}?from=${PERIOD_A.from}&to=${PERIOD_A.to}`)).toHaveLength(2);
    }
    for (const path of [bPaths.operations, bPaths.financial, bPaths.incidents, bPaths.kpis]) {
      expect(fixture.count(path)).toBe(1);
      expect(urls).toContain(`${path}?from=${PERIOD_A.from}&to=${PERIOD_A.to}`);
    }
  });
}
