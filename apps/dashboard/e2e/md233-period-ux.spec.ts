import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  companyAnalytics,
  companyAnalyticsPath,
  locationIntelligenceReply,
  locationPaths,
} from "./support/md05-intelligence-fixtures";
import {
  companyReportPaths,
  companyReportReply,
  locationReportPaths,
  locationReportReply,
} from "./support/md05-reports-fixtures";

const instant = "2026-09-28T21:30:00Z";

async function fixedClock(page: Page) {
  await page.addInitScript((iso) => {
    Date.now = () => Date.parse(iso);
  }, instant);
}

async function enterCompany(page: Page, path: string) {
  await page.goto(path);
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
}

for (const path of ["/overview", "/payments", "/analytics"] as const) {
  test(`${path} resolves Today and every preset to one Company absolute selector`, async ({
    page,
  }) => {
    const seen: string[] = [];
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (requestPath, request) => {
        if (requestPath !== companyAnalyticsPath) return undefined;
        seen.push(new URL(request.url()).search);
        return { body: companyAnalytics(request) };
      },
    });
    await fixture.install(page);
    await fixedClock(page);
    await enterCompany(page, path);
    const control = page.getByTestId("dashboard-period-control");
    await expect(
      control.getByRole("button", { name: "Today", pressed: true }),
    ).toBeVisible();
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0]).toBe("?from=2026-09-29&to=2026-09-29");
    for (const [label, from] of [
      ["Last 2 days", "2026-09-28"],
      ["Last 3 days", "2026-09-27"],
      ["Last 7 days", "2026-09-23"],
      ["Last 14 days", "2026-09-16"],
      ["Last 30 days", "2026-08-31"],
    ] as const) {
      await control.getByRole("button", { name: label }).click();
      await expect(
        control.getByRole("button", { name: label, pressed: true }),
      ).toBeVisible();
      await expect.poll(() => seen.at(-1)).toBe(`?from=${from}&to=2026-09-29`);
    }
    expect(seen).toHaveLength(6);
    for (const family of Object.values(locationPaths))
      expect(fixture.count(family)).toBe(0);
  });
}

test("a relative preset recomputes under the Location timezone while Custom remains absolute", async ({
  page,
}) => {
  const location = { ...LOCATION_A, timezone: "America/New_York" };
  const seen: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [location] },
    override: (path, request) => {
      if (path === companyAnalyticsPath || path === locationPaths.operations) {
        seen.push(`${path}${new URL(request.url()).search}`);
      }
      return path === companyAnalyticsPath
        ? { body: companyAnalytics(request) }
        : locationIntelligenceReply(path, request, 4);
    },
  });
  await fixture.install(page);
  await fixedClock(page);
  await enterCompany(page, "/overview");
  await page.getByRole("button", { name: "Last 7 days" }).click();
  await expect
    .poll(() => seen.at(-1))
    .toContain("from=2026-09-23&to=2026-09-29");
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope" })
    .click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: location.name }).click();
  await expect(
    page.getByRole("button", { name: "Last 7 days", pressed: true }),
  ).toBeVisible();
  await expect
    .poll(() => seen.find((url) => url.includes(locationPaths.operations)))
    .toContain("from=2026-09-22&to=2026-09-28");
  const control = page.getByTestId("dashboard-period-control");
  await control.getByRole("button", { name: "Custom" }).click();
  const dialog = page.getByRole("dialog", { name: "Select analytics period" });
  await dialog.getByLabel("From").fill("2026-09-01");
  await dialog.getByLabel("To").fill("2026-09-07");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(
    control.getByRole("button", { name: "Custom", pressed: true }),
  ).toBeVisible();
  expect(new URL(page.url()).search).toBe("?from=2026-09-01&to=2026-09-07");
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope" })
    .click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect
    .poll(() => seen.at(-1))
    .toContain("from=2026-09-01&to=2026-09-07");
});

for (const [kind, field, value, path] of [
  ["Daily", "Date", "2026-09-29", companyReportPaths.daily],
  ["Weekly", "Week start (Monday)", "2026-09-28", companyReportPaths.weekly],
  ["Monthly", "Month", "2026-09", companyReportPaths.monthly],
] as const) {
  test(`Company ${kind} report prefills its current calendar selector without an extra read`, async ({
    page,
  }) => {
    const seen: string[] = [];
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (requestPath, request) => {
        if (requestPath === path) seen.push(new URL(request.url()).search);
        return companyReportReply(requestPath, request);
      },
    });
    await fixture.install(page);
    await fixedClock(page);
    await enterCompany(page, "/reports");
    await page.getByRole("button", { name: `Preview ${kind} Report` }).click();
    const dialog = page.getByRole("dialog", { name: `Preview ${kind} Report` });
    await expect(dialog.getByLabel(field, { exact: true })).toHaveValue(value);
    expect(seen).toHaveLength(0);
    await dialog.getByRole("button", { name: "Load preview" }).click();
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0]).toContain(value);
  });
}

test("Location Daily report uses its own timezone to prefill the existing selector", async ({
  page,
}) => {
  const location = { ...LOCATION_A, timezone: "America/New_York" };
  const seen: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [location] },
    override: (path, request) => {
      if (path === locationReportPaths.daily)
        seen.push(new URL(request.url()).search);
      return locationReportReply(path, request);
    },
  });
  await fixture.install(page);
  await fixedClock(page);
  await page.goto("/reports");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: location.name }).click();
  await page.getByRole("button", { name: "Preview Daily Report" }).click();
  const dialog = page.getByRole("dialog", { name: "Preview Daily Report" });
  await expect(dialog.getByLabel("Date", { exact: true })).toHaveValue(
    "2026-09-28",
  );
  await dialog.getByRole("button", { name: "Load preview" }).click();
  await expect.poll(() => seen).toEqual(["?date=2026-09-28"]);
});

test("relative Today advances on visible online resume; Custom stays fixed", async ({
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
  await fixedClock(page);
  await enterCompany(page, "/overview");
  await expect.poll(() => seen).toEqual(["?from=2026-09-29&to=2026-09-29"]);
  await page.evaluate(() => {
    Date.now = () => Date.parse("2026-09-29T21:30:00Z");
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(seen).toHaveLength(1);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    window.dispatchEvent(new Event("online"));
  });
  await expect.poll(() => seen.at(-1)).toBe("?from=2026-09-30&to=2026-09-30");
  const control = page.getByTestId("dashboard-period-control");
  await control.getByRole("button", { name: "Custom" }).click();
  const dialog = page.getByRole("dialog", { name: "Select analytics period" });
  await dialog.getByLabel("From").fill("2026-09-01");
  await dialog.getByLabel("To").fill("2026-09-07");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect.poll(() => seen.at(-1)).toBe("?from=2026-09-01&to=2026-09-07");
  const reads = seen.length;
  await page.evaluate(() => {
    Date.now = () => Date.parse("2026-10-01T21:30:00Z");
    window.dispatchEvent(new Event("online"));
  });
  expect(seen).toHaveLength(reads);
  await expect(
    control.getByRole("button", { name: "Custom", pressed: true }),
  ).toBeVisible();
});

test("reopening a Daily report follows the current Company calendar date", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => companyReportReply(path, request),
  });
  await fixture.install(page);
  await fixedClock(page);
  await enterCompany(page, "/reports");
  await page.getByRole("button", { name: "Preview Daily Report" }).click();
  let dialog = page.getByRole("dialog", { name: "Preview Daily Report" });
  await expect(dialog.getByLabel("Date", { exact: true })).toHaveValue(
    "2026-09-29",
  );
  await dialog.getByRole("button", { name: "Close" }).click();
  await page.evaluate(() => {
    Date.now = () => Date.parse("2026-09-29T21:30:00Z");
  });
  await page.getByRole("button", { name: "Preview Daily Report" }).click();
  dialog = page.getByRole("dialog", { name: "Preview Daily Report" });
  await expect(dialog.getByLabel("Date", { exact: true })).toHaveValue(
    "2026-09-30",
  );
});
