import { expect, test } from "@playwright/test";
import { staffDirectoryItem } from "./support/administration-fixtures";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

for (const locale of ["en", "ar"] as const) {
  for (const dark of [false, true]) {
    for (const narrow of [false, true]) {
      test(`T05-E visual ${locale} ${dark ? "dark" : "light"} ${narrow ? "narrow" : "desktop"}`, async ({
        page,
      }, info) => {
        await page.setViewportSize({ width: narrow ? 480 : 1440, height: 900 });
        const item = staffDirectoryItem();
        const base = `/v1/staff/management/organizations/${ORG_A.organizationId}/staff`;
        const historyBase = `/v1/staff/management/organizations/${ORG_A.organizationId}/shifts`;
        const shift = {
          shiftId: "60000000-0000-4000-8000-000000000001",
          membershipId: item.membershipId,
          identity: item.identity,
          currentRole: item.role,
          location: {
            locationId: LOCATION_A.locationId,
            name: LOCATION_A.name,
            code: LOCATION_A.code,
            timezone: LOCATION_A.timezone,
          },
          status: "ACTIVE",
          startedAt: "2026-10-01T05:00:00.000Z",
          endedAt: null,
        };
        const fixture = new DashboardApiFixture({
          companyOrganizations: [ORG_A],
          companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
          override: (path) => {
            if (path === base)
              return { body: { items: [item], nextCursor: null } };
            if (path === `${base}/${item.membershipId}`)
              return {
                body: {
                  ...item,
                  locationAccess: {
                    items: [],
                    totalCount: 0,
                    truncated: false,
                  },
                },
              };
            if (path.endsWith("/location-access"))
              return { body: { items: [], nextCursor: null } };
            if (path === historyBase)
              return { body: { items: [shift], nextCursor: null } };
            if (path === `${historyBase}/${shift.shiftId}`)
              return { body: shift };
            return undefined;
          },
        });
        await fixture.install(page);
        await page.goto("/employees");
        await signInOnCurrentPage(page);
        await page.getByRole("button", { name: ORG_A.name }).click();
        await page.getByRole("button", { name: LOCATION_A.name }).click();
        if (dark)
          await page
            .getByRole("group", { name: "Theme" })
            .getByRole("button")
            .nth(1)
            .click();
        if (locale === "ar")
          await page
            .getByRole("button", { name: "Language", exact: true })
            .click();
        await expect(page.getByRole("table")).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForLoadState("networkidle");
        await page.screenshot({
          path: info.outputPath("employees.png"),
          animations: "disabled",
        });
        await page.getByRole("table").getByRole("button").first().click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.waitForLoadState("networkidle");
        await page.screenshot({
          path: info.outputPath("employee-drawer.png"),
          animations: "disabled",
        });
        await page.keyboard.press("Escape");
        await page
          .getByRole("button", {
            name: locale === "ar" ? "الورديات" : "Shifts",
            exact: true,
          })
          .click();
        await expect(page.getByRole("table")).toContainText(
          item.identity.email,
        );
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBe(narrow ? 480 : 1440);
        expect(
          await page
            .getByRole("table")
            .locator("td")
            .first()
            .evaluate((element) => getComputedStyle(element).padding),
        ).toBe("14px 24px");
        await page.waitForLoadState("networkidle");
        await page.screenshot({
          path: info.outputPath("shifts.png"),
          animations: "disabled",
        });
        await page.getByRole("table").getByRole("button").first().click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expect(page.getByRole("dialog")).toContainText(
          item.identity.email,
        );
        await page.screenshot({
          path: info.outputPath("shift-drawer.png"),
          animations: "disabled",
        });
      });
    }
  }
}
