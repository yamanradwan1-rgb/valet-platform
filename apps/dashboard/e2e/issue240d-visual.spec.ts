import { expect, test } from "@playwright/test";
import { staffDirectoryItem } from "./support/administration-fixtures";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

for (const narrow of [false, true]) {
  test(`T05-D frozen surfaces ${narrow ? "AR dark narrow" : "EN light desktop"}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: narrow ? 480 : 1440, height: 900 });
    const item = staffDirectoryItem();
    const base = `/v1/staff/management/organizations/${ORG_A.organizationId}/staff`;
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path) => {
        if (path === base) return { body: { items: [item], nextCursor: null } };
        if (path === `${base}/${item.membershipId}`)
          return {
            body: {
              ...item,
              locationAccess: { items: [], totalCount: 0, truncated: false },
            },
          };
        if (path.endsWith("/location-access"))
          return { body: { items: [], nextCursor: null } };
        if (path.endsWith("/active-shifts"))
          return { body: { items: [], nextCursor: null } };
        return undefined;
      },
    });
    await fixture.install(page);
    await page.goto("/employees");
    await signInOnCurrentPage(page);
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page.getByRole("button", { name: LOCATION_A.name }).click();
    if (narrow) {
      await page
        .getByRole("group", { name: "Theme" })
        .getByRole("button")
        .nth(1)
        .click();
      await page.getByRole("button", { name: "Language", exact: true }).click();
    }
    await expect(page.getByRole("table")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: info.outputPath("employees.png"),
      animations: "disabled",
    });
    await page.getByRole("table").getByRole("button").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: info.outputPath("drawer.png"),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", {
        name: narrow ? "الورديات" : "Shifts",
        exact: true,
      })
      .click();
    await expect(page.getByRole("table")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: info.outputPath("shifts.png"),
      animations: "disabled",
    });
  });
}
