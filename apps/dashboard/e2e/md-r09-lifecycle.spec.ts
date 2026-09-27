import { expect, test } from "@playwright/test";
import { standardCompanyFixture } from "./support/md05-analytics-fixtures";
import {
  companyAnalytics,
  companyAnalyticsPath,
  PERIOD_A,
} from "./support/md05-intelligence-fixtures";
import { authPayload, ORG_A } from "./support/fixture-data";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  cards,
  enterR09,
  expectNoLocationRequests,
  expectR09Loaded,
  pageRoot,
  routes,
} from "./support/md-r09-fixtures";

for (const route of routes) {
  test(`${route} fences a pending response across logout and replacement authentication`, async ({
    page,
  }) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reads = 0;
    let logins = 0;
    const fixture = standardCompanyFixture(async (path, request) => {
      if (path === "/v1/staff/auth/login")
        return { body: authPayload(++logins === 1 ? "A" : "C") };
      if (path !== companyAnalyticsPath) return undefined;
      const first = ++reads === 1;
      const body = companyAnalytics(request, first ? 991 : 7);
      if (first)
        body.summary.financial.currencies[0]!.collectedAmountTotal = "991.999";
      if (first) await held;
      return { body };
    });
    await fixture.install(page);
    await enterR09(page, route);
    await expect.poll(() => reads).toBe(1);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(pageRoot(page, route)).toHaveCount(0);
    await signInOnCurrentPage(page);
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page.getByRole("button", { name: "All Locations" }).click();
    await expectR09Loaded(page, route);
    release();
    // Observe the completed old request and an independent render turn, not just the new response.
    await page.waitForTimeout(250);
    await expect(cards(page, route).first()).not.toContainText("991");
    await expectR09Loaded(page, route);
    expect(reads).toBe(2);
    expect(logins).toBe(2);
  });

  test(`${route} retries a transient error once without automatic request loops`, async ({
    page,
  }) => {
    let reads = 0;
    const fixture = standardCompanyFixture((path, request) =>
      path === companyAnalyticsPath
        ? ++reads === 1
          ? {
              status: 503,
              body: { code: "UNAVAILABLE", message: "private server detail" },
            }
          : { body: companyAnalytics(request) }
        : undefined,
    );
    await fixture.install(page);
    await enterR09(page, route);
    await expect(
      pageRoot(page, route).getByRole("button", { name: "Retry" }).first(),
    ).toBeVisible();
    await expect(pageRoot(page, route)).not.toContainText(
      "private server detail",
    );
    expect(reads).toBe(1);
    await pageRoot(page, route)
      .getByRole("button", { name: "Retry" })
      .first()
      .click();
    await expectR09Loaded(page, route);
    expect(reads).toBe(2);
    expectNoLocationRequests(fixture);
  });

  for (const [label, query] of [
    ["low year", "?from=0099-09-01&to=0099-09-07"],
    ["noncanonical", "?from=2026-9-01&to=2026-09-07"],
    ["missing end", "?from=2026-09-01"],
  ]) {
    test(`${route} rejects ${label} dates without dispatch`, async ({
      page,
    }) => {
      const fixture = standardCompanyFixture();
      await fixture.install(page);
      await enterR09(page, route, "company", query);
      await expect(
        page
          .getByText(/Use real canonical dates|Choose real calendar dates/u)
          .first(),
      ).toBeVisible();
      expect(fixture.count(companyAnalyticsPath)).toBe(0);
      expectNoLocationRequests(fixture);
    });
  }

  for (const locale of ["en", "ar"]) {
    test(`${route} ${locale} period keyboard focus survives edit, Escape and reopen`, async ({
      page,
    }) => {
      const fixture = standardCompanyFixture();
      await fixture.install(page);
      await enterR09(page, route, "company", "");
      if (locale === "ar")
        await page
          .getByRole("button", { name: "Language", exact: true })
          .click();
      await page.setViewportSize({ width: 480, height: 900 });
      const opener = pageRoot(page, route)
        .locator('button[aria-haspopup="dialog"]')
        .first();
      await opener.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog");
      const from = dialog.getByLabel(locale === "ar" ? "من" : "From");
      await expect(from).toBeFocused();
      await from.fill(PERIOD_A.from);
      await expect(from).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(from).toBeFocused();
      expect(fixture.count(companyAnalyticsPath)).toBe(0);
    });
  }
}
