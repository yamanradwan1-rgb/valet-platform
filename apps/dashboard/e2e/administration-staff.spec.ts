import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  enterHistory,
  historyPath,
  historyRow,
} from "./support/issue240e-history";

test("Company Admin reads organization history with All Locations selected", async ({
  page,
}) => {
  const path = historyPath();
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (route) =>
      route === path
        ? { body: { items: [historyRow()], nextCursor: null } }
        : undefined,
  });
  await fixture.install(page);
  await enterHistory(page);
  await expect(page.getByRole("table")).toContainText("Maya O’Connor");
  expect(fixture.count(path)).toBe(1);
  expect(
    [...fixture.counts.keys()].some((route) =>
      route.endsWith("/active-shifts"),
    ),
  ).toBe(false);
  await expect(
    page.getByRole("table").getByText(historyRow().shiftId, { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /start shift|end shift|force end|attendance|payroll/i,
    }),
  ).toHaveCount(0);
});
test("Location Manager history uses one organization read across authorized locations", async ({
  page,
}) => {
  const path = historyPath();
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (route) =>
      route === path
        ? {
            body: {
              items: [
                historyRow({
                  status: "ENDED",
                  endedAt: "2026-10-02T07:00:00.000Z",
                }),
              ],
              nextCursor: null,
            },
          }
        : undefined,
  });
  await fixture.install(page);
  await page.goto("/employees");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByRole("table")).toContainText("Maya O’Connor");
  await expect(page.getByRole("table")).toContainText("Ended");
  expect(fixture.count(path)).toBe(1);
  expect(
    [...fixture.counts.keys()].some((route) =>
      route.endsWith("/active-shifts"),
    ),
  ).toBe(false);
  await expect(
    page.getByRole("button", { name: "Employees", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /start shift|end shift|force end|attendance|payroll/i,
    }),
  ).toHaveCount(0);
});
