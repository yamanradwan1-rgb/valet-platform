import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  employeeContext,
  LOCATION_A,
  ORG_A,
  supervisorContext,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  ANALYTICS_PERIOD,
  analyticsLocationFamilies,
  applyAnalyticsPeriod,
  enterCompanyAnalytics,
  enterCompanyLocationAnalytics,
  enterManagerAnalytics,
  exactPeriodUrl,
  MIXED_TIMEZONE_EXPECTATIONS,
  mixedEvidenceCompanyAnalytics,
  nonAnalyticsLocationFamilies,
  requestPathAndQuery,
  standardCompanyFixture,
  standardLocationFixture,
} from "./support/md05-analytics-fixtures";
import {
  companyAnalytics,
  companyAnalyticsPath,
  companyContextPath,
  locationIntelligenceReply,
  PERIOD_A,
  PERIOD_B,
  requestPeriod,
  staleInactiveExactLocationContext,
} from "./support/md05-intelligence-fixtures";
import { expectNoLocationIntelligence } from "./support/md05-protected-route-proof";
import { proveAnalyticsReferenceGeometry } from "./support/md05-analytics-visual-proof";

async function expectLoaded(page: Page, value: string) {
  await expect(page.getByTestId("analytics-metric-card").first()).toContainText(value);
}

test("Company waits for a valid explicit period and makes one exact all-locations request", async ({ page }) => {
  const urls: string[] = [];
  const fixture = standardCompanyFixture((path, request) => {
    if (path !== companyAnalyticsPath) return undefined;
    urls.push(requestPathAndQuery(request));
    return { body: companyAnalytics(request, 7) };
  });
  await fixture.install(page);
  await enterCompanyAnalytics(page);
  expect(fixture.count(companyAnalyticsPath)).toBe(0);
  expectNoLocationIntelligence(fixture);
  await applyAnalyticsPeriod(page);
  await expectLoaded(page, "7");
  expect(urls).toEqual([exactPeriodUrl(companyAnalyticsPath)]);
  expectNoLocationIntelligence(fixture);
});

for (const [label, manager] of [["CA", false], ["LM", true]] as const) {
  test(`${label} active Location uses exactly the four granted Location families`, async ({ page }) => {
    const urls: string[] = [];
    const fixture = standardLocationFixture(manager, (path, request) => {
      if (analyticsLocationFamilies.some((family) => family === path)) {
        urls.push(requestPathAndQuery(request));
      }
      return locationIntelligenceReply(path, request, 4);
    });
    await fixture.install(page);
    if (manager) await enterManagerAnalytics(page);
    else await enterCompanyLocationAnalytics(page);
    await applyAnalyticsPeriod(page);
    await expectLoaded(page, "4");
    for (const path of analyticsLocationFamilies) {
      expect(fixture.count(path)).toBe(1);
      expect(urls).toContain(exactPeriodUrl(path));
    }
    expect(urls).toHaveLength(4);
    expect(fixture.count(companyAnalyticsPath)).toBe(0);
    for (const path of nonAnalyticsLocationFamilies) expect(fixture.count(path)).toBe(0);
  });
}

test("historical exact Location that revalidates INACTIVE is denied before Analytics", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: staleInactiveExactLocationContext(),
  });
  await fixture.install(page);
  await page.goto("/analytics");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect.poll(() => fixture.count(companyContextPath)).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId("md05-analytics-page")).toHaveCount(0);
  expect(fixture.count(companyAnalyticsPath)).toBe(0);
  expectNoLocationIntelligence(fixture);
});

for (const [role, context] of [
  ["Supervisor", supervisorContext()],
  ["Employee", employeeContext()],
] as const) {
  test(`${role} direct Analytics route fails closed`, async ({ page }) => {
    const fixture = new DashboardApiFixture({ operationalContexts: [context] });
    await fixture.install(page);
    await page.goto("/analytics");
    await signInOnCurrentPage(page, `${role.toLowerCase()}@example.com`);
    await expect(page.getByTestId("md05-analytics-page")).toHaveCount(0);
    expect(fixture.count(companyAnalyticsPath)).toBe(0);
    expectNoLocationIntelligence(fixture);
  });
}

test("Guest direct Analytics route fails closed", async ({ page }) => {
  const fixture = new DashboardApiFixture();
  await fixture.install(page);
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByTestId("md05-analytics-page")).toHaveCount(0);
  expect(fixture.count(companyAnalyticsPath)).toBe(0);
  expectNoLocationIntelligence(fixture);
});

for (const invalid of [
  ["non-canonical", "2026-9-01", "2026-09-07", "Choose real calendar dates"],
  ["impossible", "2026-02-30", "2026-03-01", "Choose real calendar dates"],
  ["reversed", "2026-09-07", "2026-09-01", "From must be on or before To"],
  ["32-day inclusive", "2026-09-01", "2026-10-02", "at most 31 calendar days"],
] as const) {
  test(`${invalid[0]} period is not coerced and causes zero analytics requests`, async ({ page }) => {
    const fixture = standardCompanyFixture();
    await fixture.install(page);
    const path = `/analytics?from=${invalid[1]}&to=${invalid[2]}`;
    await enterCompanyAnalytics(page, path);
    await expect(page.getByText(new RegExp(invalid[3], "u")).first()).toBeVisible();
    const url = new URL(page.url());
    expect(url.searchParams.get("from")).toBe(invalid[1]);
    expect(url.searchParams.get("to")).toBe(invalid[2]);
    expect(fixture.count(companyAnalyticsPath)).toBe(0);
    expectNoLocationIntelligence(fixture);
  });
}

test("period change fences a late stale success", async ({ page }) => {
  const fixture = standardCompanyFixture((path, request) => {
    if (path !== companyAnalyticsPath) return undefined;
    const period = requestPeriod(request);
    const first = period.from === PERIOD_A.from;
    return { body: companyAnalytics(request, first ? 91 : 23), ...(first ? { delayMs: 800 } : {}) };
  });
  await fixture.install(page);
  await enterCompanyAnalytics(page);
  await applyAnalyticsPeriod(page, PERIOD_A.from, PERIOD_A.to);
  await expect.poll(() => fixture.count(companyAnalyticsPath)).toBe(1);
  await applyAnalyticsPeriod(page, PERIOD_B.from, PERIOD_B.to);
  await expectLoaded(page, "23");
  await page.waitForTimeout(900);
  await expect(page.getByText("91", { exact: true })).toHaveCount(0);
});

test("period change fences a late stale failure", async ({ page }) => {
  const fixture = standardCompanyFixture((path, request) => {
    if (path !== companyAnalyticsPath) return undefined;
    if (requestPeriod(request).from === PERIOD_A.from) {
      return {
        status: 500,
        delayMs: 800,
        body: { code: "INTERNAL_ERROR", message: "stale failure", requestId: "stale" },
      };
    }
    return { body: companyAnalytics(request, 31) };
  });
  await fixture.install(page);
  await enterCompanyAnalytics(page);
  await applyAnalyticsPeriod(page, PERIOD_A.from, PERIOD_A.to);
  await expect.poll(() => fixture.count(companyAnalyticsPath)).toBe(1);
  await applyAnalyticsPeriod(page, PERIOD_B.from, PERIOD_B.to);
  await expectLoaded(page, "31");
  await page.waitForTimeout(900);
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expectLoaded(page, "31");
});

test("Company to Location to Company fences the first Company response", async ({ page }) => {
  let companyReads = 0;
  const fixture = standardCompanyFixture((path, request) => {
    if (path === companyAnalyticsPath) {
      companyReads += 1;
      return {
        body: companyAnalytics(request, companyReads === 1 ? 91 : 23),
        ...(companyReads === 1 ? { delayMs: 900 } : {}),
      };
    }
    return locationIntelligenceReply(path, request, 6);
  });
  await fixture.install(page);
  await enterCompanyAnalytics(page);
  await applyAnalyticsPeriod(page);
  await expect.poll(() => fixture.count(companyAnalyticsPath)).toBe(1);
  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expectLoaded(page, "6");
  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expectLoaded(page, "23");
  await page.waitForTimeout(1_000);
  await expect(page.getByText("91", { exact: true })).toHaveCount(0);
  await expectLoaded(page, "23");
});

test("Analytics preserves timezone, currency, cash, null and attribution evidence", async ({ page }) => {
  const fixture = standardCompanyFixture((path, request) =>
    path === companyAnalyticsPath ? { body: mixedEvidenceCompanyAnalytics(request) } : undefined,
  );
  await fixture.install(page);
  await enterCompanyAnalytics(page);
  await applyAnalyticsPeriod(page);
  const cards = page.getByTestId("analytics-metric-card");
  await expect(cards.nth(0)).toContainText("Cars per active employee: Unavailable");
  await expect(cards.nth(0)).toContainText("handoffs missing attribution: 2");
  await expect(cards.nth(1)).toContainText("Unavailable");
  await expect(cards.nth(2)).toContainText("missing targets: 2");
  await expect(cards.nth(2)).toContainText("invalid/missing intervals: 3");
  await expect(cards.nth(3)).toContainText("Incidents per 1000: Unavailable");
  const coverage = page.getByTestId("analytics-company-coverage");
  for (const expected of MIXED_TIMEZONE_EXPECTATIONS) {
    await expect(coverage).toContainText(expected);
  }
  await page.getByText("Analytics source evidence", { exact: true }).click();
  const evidence = page.getByTestId("analytics-source-evidence");
  for (const text of ["12.345 JOD", "45.670 USD", "-1.500 JOD", "1.250 USD"]) {
    await expect(evidence).toContainText(text);
  }
  await expect(evidence).toContainText("attributed handoffs5 · handoffs missing attribution: 2 · employee evidence: 3");
  await expect(page.getByText("58.015", { exact: true })).toHaveCount(0);
});

test("Company group-too-large 422 renders the controlled state", async ({ page }) => {
  const fixture = standardCompanyFixture((path) => path === companyAnalyticsPath ? {
    status: 422,
    body: { code: "COMPANY_ANALYTICS_TOO_LARGE", message: "raw server detail", requestId: "too-large" },
  } : undefined);
  await fixture.install(page);
  await enterCompanyAnalytics(page);
  await applyAnalyticsPeriod(page);
  await expect(page.getByText("The Company analytics grouping is too large to display safely.").first()).toBeVisible();
  await expect(page.getByText("raw server detail")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry" }).first()).toBeVisible();
});

test("Arabic Analytics preserves RTL bidi and keyboard period flow", async ({ page }) => {
  await standardCompanyFixture().install(page);
  await enterCompanyAnalytics(page);
  await page.setViewportSize({ width: 480, height: 900 });
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const opener = page.getByTestId("analytics-header-selectors").getByRole("button", { name: "اختيار الفترة" });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "اختيار فترة التحليلات" });
  const from = dialog.getByLabel("من");
  const to = dialog.getByLabel("إلى");
  await expect(from).toBeFocused();
  await from.fill(PERIOD_A.from);
  await to.fill(PERIOD_A.to);
  await from.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "تطبيق" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("bdi[dir='ltr']").filter({ hasText: `${PERIOD_A.from} – ${PERIOD_A.to}` }).first()).toBeVisible();
});

test("Analytics charts expose textual alternatives", async ({ page }) => {
  await standardCompanyFixture().install(page);
  await enterCompanyAnalytics(page);
  await applyAnalyticsPeriod(page);
  await expect(page.getByRole("img", { name: "Vehicle Activity" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Duration Comparison" })).toBeVisible();
  const activity = page.getByTestId("analytics-activity-text");
  await expect(activity.locator("caption")).toHaveText("Vehicle Activity");
  await expect(activity.locator("tbody tr").first().locator("td")).toHaveText([PERIOD_A.from, "7"]);
  const durations = page.getByTestId("analytics-duration-text");
  await expect(durations.locator("caption")).toHaveText("Duration Comparison");
  await expect(durations.locator("tbody tr").first().locator("td")).toHaveText(["Check-in Time", "12.500", "2", "2"]);
});

test("Analytics frozen geometry holds in EN/AR desktop+narrow light/dark", async ({ page }) => {
  await proveAnalyticsReferenceGeometry(page);
});
