import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  ORG_A,
  ORG_B,
} from "./support/dashboard-api-fixture";
import { staffItem, staffPath } from "./support/administration-r05-fixtures";
import {
  deferred,
  signInCompany,
  changeOrganization,
} from "./support/staff-directory-ui";
for (const mode of ["success", "failure"] as const) {
  test(`R05 Employees A→B→A fences stale first-A ${mode}`, async ({ page }) => {
    const pathA = staffPath(ORG_A.organizationId);
    const pathB = staffPath(ORG_B.organizationId);
    const started = deferred();
    const release = deferred();
    let aCalls = 0;
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A, ORG_B],
      override: async (path) => {
        if (path === pathA) {
          aCalls += 1;
          if (aCalls === 1) {
            started.resolve();
            await release.promise;
            return mode === "success"
              ? {
                  body: {
                    items: [
                      staffItem({ identity: { email: "stale-a@example.com" } }),
                    ],
                    nextCursor: null,
                  },
                }
              : {
                  status: 503,
                  body: {
                    code: "TEMPORARY",
                    message: "stale employee failure",
                    requestId: "r05-stale-employee",
                  },
                };
          }
          return {
            body: {
              items: [
                staffItem({ identity: { email: "fresh-a@example.com" } }),
              ],
              nextCursor: null,
            },
          };
        }
        if (path === pathB) {
          return {
            body: {
              items: [staffItem({ identity: { email: "bravo@example.com" } })],
              nextCursor: null,
            },
          };
        }
        return undefined;
      },
    });
    await fixture.install(page);
    await signInCompany(page);
    await started.promise;

    await changeOrganization(page, ORG_B.name);
    await expect(
      page.getByText("bravo@example.com", { exact: true }),
    ).toBeVisible();
    await changeOrganization(page, ORG_A.name);
    await expect(
      page.getByText("fresh-a@example.com", { exact: true }),
    ).toBeVisible();

    release.resolve();
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByText("fresh-a@example.com", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("stale-a@example.com", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("stale employee failure", { exact: true }),
    ).toHaveCount(0);
  });
}
