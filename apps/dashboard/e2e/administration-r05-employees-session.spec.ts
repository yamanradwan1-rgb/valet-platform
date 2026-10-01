import { expect, test } from "@playwright/test";
import { DashboardApiFixture, ORG_A } from "./support/dashboard-api-fixture";
import { staffItem, staffPath } from "./support/administration-r05-fixtures";
import { deferred, signInCompany } from "./support/staff-directory-ui";
import { signInOnCurrentPage } from "./support/foundation-ui";
for (const mode of ["success", "failure"] as const) {
  test(`R05 pending Employees ${mode} cannot repaint after logout`, async ({
    page,
  }) => {
    const path = staffPath(ORG_A.organizationId);
    const started = deferred();
    const release = deferred();
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      override: async (requestPath) => {
        if (requestPath !== path) return undefined;
        started.resolve();
        await release.promise;
        return mode === "success"
          ? {
              body: {
                items: [
                  staffItem({
                    identity: { email: "logged-out-stale@example.com" },
                  }),
                ],
                nextCursor: null,
              },
            }
          : {
              status: 503,
              body: {
                code: "TEMPORARY",
                message: "logged-out stale failure",
                requestId: "r05-logout-stale",
              },
            };
      },
    });
    await fixture.install(page);
    await signInCompany(page);
    await started.promise;
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    release.resolve();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(
      page.getByText("logged-out-stale@example.com", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("logged-out stale failure", { exact: true }),
    ).toHaveCount(0);
  });
}

for (const mode of ["success", "failure"] as const) {
  test(`R05 replacement session fences prior pending Employees ${mode}`, async ({
    page,
  }) => {
    const path = staffPath(ORG_A.organizationId);
    const started = deferred();
    const release = deferred();
    let calls = 0;
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      override: async (requestPath) => {
        if (requestPath !== path) return undefined;
        calls += 1;
        if (calls === 1) {
          started.resolve();
          await release.promise;
          return mode === "success"
            ? {
                body: {
                  items: [
                    staffItem({
                      identity: { email: "old-session@example.com" },
                    }),
                  ],
                  nextCursor: null,
                },
              }
            : {
                status: 503,
                body: {
                  code: "TEMPORARY",
                  message: "old session failure",
                  requestId: "old-session",
                },
              };
        }
        return {
          body: {
            items: [
              staffItem({
                identity: { email: "replacement-session@example.com" },
              }),
            ],
            nextCursor: null,
          },
        };
      },
    });
    await fixture.install(page);
    await signInCompany(page);
    await started.promise;
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    await signInOnCurrentPage(page, "replacement-admin@example.com");
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page.getByRole("button", { name: "All Locations" }).click();
    await expect(
      page.getByText("replacement-session@example.com", { exact: true }),
    ).toBeVisible();

    release.resolve();
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByText("replacement-session@example.com", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("old-session@example.com", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("old session failure", { exact: true }),
    ).toHaveCount(0);
  });
}
