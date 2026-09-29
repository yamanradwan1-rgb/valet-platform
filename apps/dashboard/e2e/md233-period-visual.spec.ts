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

for (const route of ["overview", "payments", "analytics", "reports"] as const) {
  test(`${route} period surface stays readable in EN/AR, light/dark and narrow layouts`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path, request) =>
        path === companyAnalyticsPath
          ? { body: companyAnalytics(request) }
          : undefined,
    });
    await fixture.install(page);
    await page.addInitScript(() => {
      Date.now = () => Date.parse("2026-09-28T21:30:00Z");
    });
    await page.goto(`/${route}`);
    await signInOnCurrentPage(page);
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page.getByRole("button", { name: "All Locations" }).click();
    const root = page.getByTestId(`md05-${route}-page`);
    await expect(root).toBeVisible();
    if (route === "reports") {
      await page.getByRole("button", { name: "Preview Daily Report" }).click();
      const dialog = page.getByRole("dialog", { name: "Preview Daily Report" });
      await expect(dialog.getByLabel("Date", { exact: true })).toHaveValue(
        "2026-09-29",
      );
      await page.screenshot({
        path: info.outputPath("report-current-dialog.png"),
        fullPage: true,
      });
      await dialog.getByRole("button", { name: "Close" }).click();
    } else {
      await expect(
        root.getByRole("button", { name: "Today", pressed: true }),
      ).toBeVisible();
      await expect.poll(() => fixture.count(companyAnalyticsPath)).toBe(1);
    }
    for (const [name, width, rtl] of [
      ["en-light-desktop", 1440, false],
      ["en-dark-desktop", 1440, false],
      ["ar-dark-desktop", 1440, true],
      ["ar-dark-narrow", 480, true],
    ] as const) {
      if (name === "en-dark-desktop")
        await page.getByRole("button", { name: "Dark", exact: true }).click();
      if (name === "ar-dark-desktop")
        await page
          .getByRole("button", { name: "Language", exact: true })
          .click();
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        rtl ? "rtl" : "ltr",
      );
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: info.outputPath(`${name}.png`),
        fullPage: true,
      });
    }
  });
}
