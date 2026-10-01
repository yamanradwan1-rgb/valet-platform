import { expect, test } from "@playwright/test";
import { DashboardApiFixture, ORG_A } from "./support/dashboard-api-fixture";
import {
  staffDetail,
  staffItem,
  staffPath,
} from "./support/administration-r05-fixtures";
import { deferred, signInCompany } from "./support/staff-directory-ui";

for (const mode of ["success", "failure"] as const) {
  test(`T05-A filter reset fences pending Employee detail ${mode}`, async ({
    page,
  }) => {
    const directory = staffPath(ORG_A.organizationId);
    const started = deferred();
    const release = deferred();
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      override: async (path, request) => {
        if (path === directory)
          return {
            body: {
              items: [
                staffItem({
                  identity: {
                    email: new URL(request.url()).searchParams.has("role")
                      ? "filtered@example.com"
                      : "first@example.com",
                  },
                }),
              ],
              nextCursor: null,
            },
          };
        if (path.startsWith(directory + "/")) {
          started.resolve();
          await release.promise;
          return mode === "success"
            ? {
                body: staffDetail({
                  identity: {
                    firstName: "Stale",
                    lastName: "Detail",
                    email: "stale-detail@example.com",
                  },
                }),
              }
            : {
                status: 503,
                body: {
                  code: "TEMPORARY",
                  message: "stale detail failure",
                  requestId: "stale-detail",
                },
              };
        }
        return undefined;
      },
    });
    await fixture.install(page);
    await signInCompany(page);
    await expect(
      page.getByText("first@example.com", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Details: first@example.com" })
      .click();
    await started.promise;
    await page
      .getByRole("combobox", { name: "Role" })
      .selectOption("VALET_EMPLOYEE");
    await expect(
      page.getByText("filtered@example.com", { exact: true }),
    ).toBeVisible();
    release.resolve();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByText("stale-detail@example.com", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("stale detail failure", { exact: true }),
    ).toHaveCount(0);
    expect(fixture.count(directory)).toBe(2);
    expect(fixture.count(`${directory}/${staffItem().membershipId}`)).toBe(1);
  });
}
