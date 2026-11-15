import { expect, test } from "@playwright/test";
import { staffDirectoryItem } from "./support/administration-fixtures";
import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { openEmployees, STAFF_BASE } from "./support/issue240d-onboarding";

test("Issue416 reset is default OFF: Company Admin employee detail makes no status request", async ({ page }) => {
  test.skip(
    process.env.NEXT_PUBLIC_ISSUE416_STAFF_PASSWORD_RESET_ENABLED === "1",
    "Default-OFF regression runs only on an unflagged build.",
  );
  const employee = staffDirectoryItem();
  const detailPath = `${STAFF_BASE}/${employee.membershipId}`;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === STAFF_BASE) return { body: { items: [employee], nextCursor: null } };
      if (path === detailPath) return { body: {
        ...employee,
        locationAccess: {
          items: [{ locationId: LOCATION_A.locationId, name: LOCATION_A.name, status: "ACTIVE" }],
          totalCount: 1,
          truncated: false,
        },
        pendingInvitation: null,
      } };
      return undefined;
    },
  });
  await openEmployees(page, fixture);
  await page.getByRole("table").getByRole("button").first().click();
  await expect(page.getByRole("dialog").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset password" })).toHaveCount(0);
  expect(fixture.count(`${detailPath}/password-resets/status`)).toBe(0);
  expect(fixture.count(`${detailPath}/password-resets`)).toBe(0);
});
