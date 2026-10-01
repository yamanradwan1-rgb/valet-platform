import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  activeShiftsPath,
  STAFF_EMAIL,
  staffDetail,
  staffItem,
  staffPath,
} from "./support/administration-r05-fixtures";
import { signInOnCurrentPage } from "./support/foundation-ui";

const mixedLocation = {
  ...LOCATION_B,
  code: "GATE-A-01",
  name: "مرآب Gate A الطويل",
};

test("T05-B LM grant rows and assignment preserve AR RTL mixed-direction labels", async ({
  page,
}) => {
  const directory = staffPath(ORG_A.organizationId);
  const detail = `${directory}/${staffItem().membershipId}`;
  const grants = `${detail}/location-access`;
  const candidates = `${grants}/candidates`;
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: {
      [ORG_A.organizationId]: [LOCATION_A, mixedLocation],
    },
    override: (path, request) => {
      if (path === activeShiftsPath(LOCATION_A.locationId))
        return { body: { items: [], nextCursor: null } };
      if (path === directory)
        return { body: { items: [staffItem()], nextCursor: null } };
      if (path === detail) return { body: staffDetail() };
      if (path === grants && request.method() === "GET")
        return {
          body: {
            items: [
              {
                code: mixedLocation.code,
                locationId: mixedLocation.locationId,
                name: mixedLocation.name,
                status: "ACTIVE",
              },
            ],
            nextCursor: null,
          },
        };
      if (path === candidates && request.method() === "GET")
        return {
          body: {
            items: [
              {
                code: mixedLocation.code,
                granted: false,
                locationId: mixedLocation.locationId,
                name: mixedLocation.name,
                status: "ACTIVE",
              },
            ],
            nextCursor: null,
          },
        };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/employees");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await page.getByRole("button", { name: "Employees", exact: true }).click();
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByText("إدارة الموظفين ضمن المواقع المصرح لك بها."),
  ).toBeVisible();
  await page.getByRole("button", { name: `التفاصيل: ${STAFF_EMAIL}` }).click();
  const drawer = page.getByRole("dialog");
  const grantName = drawer.locator('bdi[dir="auto"]').filter({
    hasText: mixedLocation.name,
  });
  await expect(grantName).toBeVisible();
  await expect(
    drawer.locator('bdi[dir="ltr"]', { hasText: mixedLocation.code }),
  ).toBeVisible();

  await drawer
    .getByRole("button", { name: "منح صلاحية المواقع المحددة" })
    .click();
  const assignment = page.getByRole("dialog", { name: "صلاحيات المواقع" });
  await expect(
    assignment
      .locator('bdi[dir="auto"]')
      .filter({ hasText: mixedLocation.name }),
  ).toBeVisible();
  await expect(
    assignment.locator('bdi[dir="ltr"]', { hasText: mixedLocation.code }),
  ).toBeVisible();
});
