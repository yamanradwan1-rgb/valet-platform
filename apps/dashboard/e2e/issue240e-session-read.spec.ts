import { expect, test } from "@playwright/test";
import { DashboardApiFixture, ORG_A } from "./support/dashboard-api-fixture";
import { deferred } from "./support/staff-directory-ui";
import {
  enterHistory,
  historyPath,
  historyRow,
  failure,
} from "./support/issue240e-history";
for (const mode of ["success", "failure"] as const) {
  test(`history exact-session refresh fences pending detail ${mode}`, async ({
    page,
  }) => {
    const path = historyPath(),
      row = historyRow(),
      started = deferred(),
      release = deferred();
    let reads = 0;
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      override: async (route) => {
        if (route === path) {
          if (++reads === 2)
            return {
              status: 401,
              body: {
                code: "STAFF_AUTHENTICATION_REQUIRED",
                message: "Session expired",
                requestId: "history-expired",
              },
            };
          return { body: { items: [row], nextCursor: null } };
        }
        if (route === `${path}/${row.shiftId}`) {
          started.resolve();
          await release.promise;
          return mode === "failure"
            ? failure()
            : {
                body: historyRow({
                  identity: {
                    firstName: "Old",
                    lastName: "Detail",
                    email: "old-detail@example.com",
                  },
                }),
              };
        }
        return undefined;
      },
    });
    await fixture.install(page);
    await enterHistory(page);
    await expect(page.getByRole("table")).toBeVisible();
    await page.getByRole("table").getByRole("button").first().click();
    await started.promise;
    await page.keyboard.press("Escape");
    await page
      .getByRole("combobox", { name: "Status", exact: true })
      .selectOption("ENDED");
    await expect.poll(() => fixture.count("/v1/staff/auth/refresh")).toBe(1);
    await expect(
      page.getByRole("button", { name: "Employees", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Shifts", exact: true }).click();
    await expect(page.getByRole("table")).toContainText("Maya O’Connor");
    release.resolve();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByText("old-detail@example.com", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("stale history failure", { exact: true }),
    ).toHaveCount(0);
  });
}
