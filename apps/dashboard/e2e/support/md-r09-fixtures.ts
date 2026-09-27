import { expect, type Page, type Request } from "@playwright/test";
import {
  LOCATION_A,
  ORG_A,
  type DashboardApiFixture,
} from "./dashboard-api-fixture";
import { signInOnCurrentPage } from "./foundation-ui";
import {
  companyAnalytics,
  locationPaths,
  PERIOD_A,
} from "./md05-intelligence-fixtures";

export const routes = ["payments", "analytics"] as const;
export type IntelligenceRoute = (typeof routes)[number];

export async function enterR09(
  page: Page,
  route: IntelligenceRoute,
  scope: "company" | "location" | "manager" = "company",
  query = `?from=${PERIOD_A.from}&to=${PERIOD_A.to}`,
) {
  await page.goto(`/${route}${query}`);
  await signInOnCurrentPage(
    page,
    scope === "manager" ? "manager@example.com" : "admin@example.com",
  );
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", {
      name: scope === "company" ? "All Locations" : LOCATION_A.name,
    })
    .click();
}

export function pageRoot(page: Page, route: IntelligenceRoute) {
  return page.getByTestId(`md05-${route}-page`);
}

export function cards(page: Page, route: IntelligenceRoute) {
  return route === "analytics"
    ? page.getByTestId("analytics-metric-card")
    : pageRoot(page, route).locator('[class*="summaryCard"]');
}

export async function expectR09Loaded(page: Page, route: IntelligenceRoute) {
  await expect(cards(page, route).first()).toContainText(
    route === "analytics" ? "7" : "12.345",
  );
}

export function expectNoLocationRequests(fixture: DashboardApiFixture) {
  for (const path of Object.values(locationPaths))
    expect(fixture.count(path)).toBe(0);
}

export function durationCompany(request: Request) {
  const body = companyAnalytics(request);
  body.summary.operational.metrics.retrievalWait.averageSeconds = "640.000";
  body.summary.operational.metrics.parkingTime.averageSeconds = "0.000";
  body.summary.operational.metrics.handoffTime.averageSeconds = null;
  body.summary.operational.metrics.handoffTime.sampleCount = 0;
  body.summary.operational.metrics.handoffTime.contributingLocationCount = 0;
  return body;
}

export async function setLocaleTheme(
  page: Page,
  locale: "en" | "ar",
  dark: boolean,
) {
  if (dark)
    await page.getByRole("button", { name: "Dark", exact: true }).click();
  if (locale === "ar")
    await page.getByRole("button", { name: "Language", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "dir",
    locale === "ar" ? "rtl" : "ltr",
  );
}
