import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  employeeContext,
  supervisorContext,
} from "./support/dashboard-api-fixture";
import { standardCompanyFixture } from "./support/md05-analytics-fixtures";
import {
  companyAnalytics,
  companyAnalyticsPath,
  companyContextPath,
} from "./support/md05-intelligence-fixtures";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  cards,
  enterR09,
  expectNoLocationRequests,
  pageRoot,
  routes,
} from "./support/md-r09-fixtures";

test("Payments renders real zero rates and source evidence without calling them unavailable", async ({
  page,
}) => {
  const fixture = standardCompanyFixture((path, request) => {
    if (path !== companyAnalyticsPath) return undefined;
    const body = companyAnalytics(request);
    const currency = body.summary.financial.currencies[0]!;
    currency.collectedAmountTotal = "0.000";
    currency.digitalPaymentRate = {
      numerator: 0,
      denominator: 2,
      percentage: "0.00",
    };
    currency.validationRate = {
      numerator: 0,
      denominator: 4,
      percentage: "0.00",
    };
    return { body };
  });
  await fixture.install(page);
  await enterR09(page, "payments");
  await expect(cards(page, "payments").nth(2)).toContainText("0.00% JOD");
  await expect(cards(page, "payments").nth(3)).toContainText("0.00% JOD");
  await expect(
    pageRoot(page, "payments").getByText("0.00% (0/2)", { exact: true }),
  ).toBeVisible();
  await expect(
    pageRoot(page, "payments").getByText("0.00% (0/4)", { exact: true }),
  ).toBeVisible();
  await expect(pageRoot(page, "payments")).not.toContainText("Unavailable");
});

test("Payments empty currency cohort stays empty with Company coverage", async ({
  page,
}) => {
  const fixture = standardCompanyFixture((path, request) =>
    path === companyAnalyticsPath
      ? { body: companyAnalytics(request, 0, []) }
      : undefined,
  );
  await fixture.install(page);
  await enterR09(page, "payments");
  const root = pageRoot(page, "payments");
  await expect(
    root
      .getByText("No financial currency cohort was returned for this period.")
      .first(),
  ).toBeVisible();
  await expect(root.getByRole("table")).toHaveCount(0);
  await expect(
    root.getByRole("region", { name: "Company coverage" }),
  ).toContainText("Inactive Locations: 1");
  expect(fixture.count(companyAnalyticsPath)).toBe(1);
});

test("Analytics empty charts contain no fallback points and retain real zero SLA and incidents", async ({
  page,
}) => {
  const fixture = standardCompanyFixture((path, request) => {
    if (path !== companyAnalyticsPath) return undefined;
    const body = companyAnalytics(request, 0);
    body.summary.operational.carsHandledPerDay = [];
    for (const metric of Object.values(body.summary.operational.metrics)) {
      metric.averageSeconds = null;
      metric.sampleCount = 0;
      metric.contributingLocationCount = 0;
    }
    body.summary.kpis.slaCompliance.percentage = "0.00";
    body.summary.kpis.slaCompliance.numerator = 0;
    body.summary.incidents.incidentCount = 0;
    return { body };
  });
  await fixture.install(page);
  await enterR09(page, "analytics");
  await expect(page.getByTestId("analytics-card-value")).toHaveText([
    "0",
    "Unavailable",
    "0.00%",
    "0",
  ]);
  await expect(
    page.getByText("No vehicle activity cohort was returned for this period."),
  ).toBeVisible();
  await expect(
    page.getByText("No duration samples were returned for this period."),
  ).toBeVisible();
  await expect(
    pageRoot(page, "analytics").locator("svg[role='img']"),
  ).toHaveCount(0);
  await expect(
    page.getByTestId("analytics-activity-text").locator("tbody tr"),
  ).toHaveCount(0);
});

for (const route of routes) {
  test(`${route} denied commercial context cannot mount or dispatch business reads`, async ({
    page,
  }) => {
    const fixture = standardCompanyFixture((path) =>
      path === companyContextPath
        ? {
            status: 403,
            body: {
              code: "DASHBOARD_ACCESS_UNAVAILABLE",
              message: "hidden commercial detail",
              requestId: "r09",
            },
          }
        : undefined,
    );
    await fixture.install(page);
    await enterR09(page, route);
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(pageRoot(page, route)).toHaveCount(0);
    expect(fixture.count(companyAnalyticsPath)).toBe(0);
    expectNoLocationRequests(fixture);
    await expect(page.getByText("hidden commercial detail")).toHaveCount(0);
  });
}

for (const [role, context] of [
  ["supervisor", supervisorContext()],
  ["employee", employeeContext()],
] as const) {
  test(`${role} direct Payments fails closed without financial requests`, async ({
    page,
  }) => {
    const fixture = new DashboardApiFixture({ operationalContexts: [context] });
    await fixture.install(page);
    await page.goto("/payments?from=2026-09-01&to=2026-09-07");
    await signInOnCurrentPage(page, `${role}@example.com`);
    await expect(pageRoot(page, "payments")).toHaveCount(0);
    expect(fixture.count(companyAnalyticsPath)).toBe(0);
    expectNoLocationRequests(fixture);
  });
}
