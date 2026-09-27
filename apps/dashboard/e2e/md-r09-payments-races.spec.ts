import { expect, test, type Page } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { standardCompanyFixture } from "./support/md05-analytics-fixtures";
import {
  companyAnalytics,
  companyAnalyticsPath,
  locationIntelligenceReply,
  locationPaths,
  locationPathsFor,
  PERIOD_B,
} from "./support/md05-intelligence-fixtures";
import { cards, enterR09, pageRoot } from "./support/md-r09-fixtures";

async function switchScope(page: Page, name: string) {
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope" })
    .click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name }).click();
}

function latch() {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { pending, release: () => release() };
}

for (const failure of [false, true]) {
  test(`Payments period A to B fences stale ${failure ? "failure" : "success"}`, async ({
    page,
  }) => {
    const old = latch();
    const fixture = standardCompanyFixture(async (path, request, source) => {
      if (path !== companyAnalyticsPath) return undefined;
      const first = source.count(path) === 1;
      const body = companyAnalytics(request);
      body.summary.financial.currencies[0]!.collectedAmountTotal = first
        ? "991.999"
        : "23.456";
      if (first) await old.pending;
      return first && failure
        ? {
            status: 503,
            body: {
              code: "UNAVAILABLE",
              message: "stale error",
              requestId: "old",
            },
          }
        : { body };
    });
    await fixture.install(page);
    await enterR09(page, "payments");
    await expect.poll(() => fixture.count(companyAnalyticsPath)).toBe(1);
    await pageRoot(page, "payments")
      .locator('button[aria-haspopup="dialog"]')
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("From").fill(PERIOD_B.from);
    await dialog.getByLabel("To").fill(PERIOD_B.to);
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(cards(page, "payments").first()).toContainText("23.456");
    old.release();
    await page.waitForTimeout(250);
    await expect(cards(page, "payments").first()).toContainText("23.456");
    await expect(pageRoot(page, "payments")).not.toContainText("991.999");
    await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
    expect(fixture.count(companyAnalyticsPath)).toBe(2);
  });

  test(`Payments Location A to B to A fences stale ${failure ? "failure" : "success"}`, async ({
    page,
  }) => {
    const old = latch();
    const pathsB = locationPathsFor(LOCATION_B.locationId);
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
      override: async (path, request, source) => {
        if (Object.values(pathsB).includes(path as never))
          return locationIntelligenceReply(path, request, 17, LOCATION_B);
        const first =
          path === locationPaths.financial && source.count(path) === 1;
        const reply = locationIntelligenceReply(path, request, first ? 91 : 23);
        if (first) await old.pending;
        return first && failure
          ? {
              status: 503,
              body: {
                code: "UNAVAILABLE",
                message: "stale error",
                requestId: "old",
              },
            }
          : reply;
      },
    });
    await fixture.install(page);
    await enterR09(page, "payments", "location");
    await expect.poll(() => fixture.count(locationPaths.financial)).toBe(1);
    await switchScope(page, LOCATION_B.name);
    await expect(cards(page, "payments").first()).toContainText("17.000");
    await switchScope(page, LOCATION_A.name);
    await expect(cards(page, "payments").first()).toContainText("23.000");
    old.release();
    await page.waitForTimeout(250);
    await expect(cards(page, "payments").first()).toContainText("23.000");
    await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
    expect(fixture.count(locationPaths.financial)).toBe(2);
    expect(fixture.count(locationPaths.financialOverview)).toBe(2);
    expect(fixture.count(pathsB.financial)).toBe(1);
    expect(fixture.count(pathsB.financialOverview)).toBe(1);
    expect(fixture.count(companyAnalyticsPath)).toBe(0);
  });
}

test("Payments Company to Location to Company fences the first Company response", async ({
  page,
}) => {
  const old = latch();
  const fixture = standardCompanyFixture(async (path, request, source) => {
    if (path !== companyAnalyticsPath)
      return locationIntelligenceReply(path, request, 6);
    const first = source.count(path) === 1;
    const body = companyAnalytics(request);
    body.summary.financial.currencies[0]!.collectedAmountTotal = first
      ? "991.999"
      : "23.456";
    if (first) await old.pending;
    return { body };
  });
  await fixture.install(page);
  await enterR09(page, "payments");
  await expect.poll(() => fixture.count(companyAnalyticsPath)).toBe(1);
  await switchScope(page, LOCATION_A.name);
  await expect(cards(page, "payments").first()).toContainText("6.000");
  await switchScope(page, "All Locations");
  await expect(cards(page, "payments").first()).toContainText("23.456");
  old.release();
  await page.waitForTimeout(250);
  await expect(cards(page, "payments").first()).toContainText("23.456");
  await expect(pageRoot(page, "payments")).not.toContainText("991.999");
  expect(fixture.count(companyAnalyticsPath)).toBe(2);
  expect(fixture.count(locationPaths.financial)).toBe(1);
  expect(fixture.count(locationPaths.financialOverview)).toBe(1);
});
