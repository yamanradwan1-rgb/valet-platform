import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  companyAnalytics,
  companyAnalyticsPath,
  locationIntelligenceReply,
  locationPathsFor,
} from "./support/md05-intelligence-fixtures";

const instant = "2026-09-28T21:30:00Z";

async function selectScope(page: Page, name: string) {
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope" })
    .click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name }).click();
}

test("7D keeps relative identity across Location A to B to A", async ({
  page,
}) => {
  const locationB = { ...LOCATION_B, timezone: "America/New_York" };
  const aPath = locationPathsFor(LOCATION_A.locationId).operations;
  const bPath = locationPathsFor(locationB.locationId).operations;
  const seen: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, locationB] },
    override: (path, request) => {
      if (path === aPath || path === bPath)
        seen.push(`${path}${new URL(request.url()).search}`);
      const location = path.startsWith(
        `/v1/staff/dashboard/locations/${locationB.locationId}/`,
      )
        ? locationB
        : LOCATION_A;
      return locationIntelligenceReply(path, request, 4, location);
    },
  });
  await fixture.install(page);
  await page.addInitScript((value) => {
    Date.now = () => Date.parse(value);
  }, instant);
  await page.goto("/overview");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await page.getByRole("button", { name: "Last 7 days" }).click();
  await expect
    .poll(() => seen.at(-1))
    .toBe(`${aPath}?from=2026-09-23&to=2026-09-29`);
  await selectScope(page, locationB.name);
  await expect(
    page.getByRole("button", { name: "Last 7 days", pressed: true }),
  ).toBeVisible();
  await expect
    .poll(() => seen.at(-1))
    .toBe(`${bPath}?from=2026-09-22&to=2026-09-28`);
  await selectScope(page, LOCATION_A.name);
  await expect
    .poll(() => seen.at(-1))
    .toBe(`${aPath}?from=2026-09-23&to=2026-09-29`);
  expect(new URL(page.url()).search).toBe("?preset=LAST_7_DAYS");
});

for (const staleFailure of [false, true]) {
  test(`rapid presets fence an older ${staleFailure ? "failure" : "success"}`, async ({
    page,
  }) => {
    const seen: string[] = [];
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path, request) => {
        if (path !== companyAnalyticsPath) return undefined;
        const search = new URL(request.url()).search;
        seen.push(search);
        if (search.includes("from=2026-08-31")) {
          return staleFailure
            ? { status: 503, delayMs: 800, body: { error: "stale failure" } }
            : { delayMs: 800, body: companyAnalytics(request, 30) };
        }
        return {
          body: companyAnalytics(
            request,
            search.includes("from=2026-09-28") ? 2 : 7,
          ),
        };
      },
    });
    await fixture.install(page);
    await page.addInitScript((value) => {
      Date.now = () => Date.parse(value);
    }, instant);
    await page.goto("/overview");
    await signInOnCurrentPage(page);
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page.getByRole("button", { name: "All Locations" }).click();
    await expect.poll(() => seen).toHaveLength(1);
    await page.getByRole("button", { name: "Last 30 days" }).click();
    await expect.poll(() => seen).toHaveLength(2);
    await page.getByRole("button", { name: "Last 7 days" }).click();
    await expect.poll(() => seen).toHaveLength(3);
    await page.getByRole("button", { name: "Last 2 days" }).click();
    await expect.poll(() => seen).toHaveLength(4);
    const value = page
      .getByTestId("md05-overview-page")
      .locator('[class*="metricCard"] [class*="metricValue"]')
      .first();
    await expect(value).toHaveText("2");
    await page.waitForTimeout(900);
    await expect(value).toHaveText("2");
    await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
    expect(seen).toEqual([
      "?from=2026-09-29&to=2026-09-29",
      "?from=2026-08-31&to=2026-09-29",
      "?from=2026-09-23&to=2026-09-29",
      "?from=2026-09-28&to=2026-09-29",
    ]);
  });
}
