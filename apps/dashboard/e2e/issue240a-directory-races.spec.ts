import { expect, test } from "@playwright/test";
import { DashboardApiFixture, ORG_A } from "./support/dashboard-api-fixture";
import {
  staffItem,
  staffDetail,
  staffPath,
} from "./support/administration-r05-fixtures";
import { deferred, signInCompany } from "./support/staff-directory-ui";

const directory = staffPath(ORG_A.organizationId);
for (const mode of ["success", "failure"] as const) {
  test(`T05-A filter A→B→A fences stale ${mode}, detail, cursor and loading`, async ({
    page,
  }) => {
    const started = deferred();
    const release = deferred();
    let aCalls = 0;
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      override: async (path, request) => {
        const search = new URL(request.url()).searchParams.get("search");
        if (path.startsWith(directory + "/"))
          return {
            body: staffDetail({
              identity: {
                firstName: "Fresh",
                lastName: "A",
                email: "fresh@example.com",
              },
            }),
          };
        if (path !== directory) return undefined;
        if (search === "A" && ++aCalls === 1) {
          started.resolve();
          await release.promise;
          return mode === "success"
            ? {
                body: {
                  items: [
                    staffItem({ identity: { email: "stale@example.com" } }),
                  ],
                  nextCursor: "STALE_CURSOR",
                },
              }
            : {
                status: 503,
                body: {
                  code: "TEMPORARY",
                  message: "stale filter failure",
                  requestId: "filter-stale",
                },
              };
        }
        const identity =
          search === "A"
            ? { firstName: "Fresh", lastName: "A", email: "fresh@example.com" }
            : { email: "b@example.com" };
        return { body: { items: [staffItem({ identity })], nextCursor: null } };
      },
    });
    await fixture.install(page);
    await signInCompany(page);
    await expect(
      page.getByText("b@example.com", { exact: true }),
    ).toBeVisible();
    await page.getByRole("searchbox").fill("A");
    await started.promise;
    await page.getByRole("searchbox").fill("B");
    await expect.poll(() => fixture.count(directory)).toBe(3);
    await expect(
      page.getByText("b@example.com", { exact: true }),
    ).toBeVisible();
    await page.getByRole("searchbox").fill("A");
    await expect(page.getByText("Fresh A", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Details: Fresh A" }).click();
    const drawer = page.getByRole("dialog", { name: "Details" });
    await expect(drawer.getByText("Fresh A", { exact: true })).toBeVisible();
    release.resolve();
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("table").getByText("Fresh A", { exact: true }),
    ).toBeVisible();
    await expect(drawer.getByText("Fresh A", { exact: true })).toBeVisible();
    await expect(
      page.getByText("stale@example.com", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("stale filter failure", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Next",
        exact: true,
        includeHidden: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Previous",
        exact: true,
        includeHidden: true,
      }),
    ).toHaveCount(0);
    expect(fixture.count(directory)).toBe(4);
  });
  test(`T05-A delayed page2 ${mode} cannot restore rows/history after filter reset`, async ({
    page,
  }) => {
    const started = deferred();
    const release = deferred();
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      override: async (path, request) => {
        if (path !== directory) return undefined;
        const query = new URL(request.url()).searchParams;
        if (query.has("cursor")) {
          started.resolve();
          await release.promise;
          return mode === "success"
            ? {
                body: {
                  items: [
                    staffItem({
                      identity: { email: "stale-page2@example.com" },
                    }),
                  ],
                  nextCursor: "STALE_NEXT",
                },
              }
            : {
                status: 503,
                body: {
                  code: "TEMPORARY",
                  message: "stale page2 failure",
                  requestId: "page2-stale",
                },
              };
        }
        return {
          body: {
            items: [
              staffItem({
                identity: {
                  email: query.has("role")
                    ? "filtered@example.com"
                    : "first@example.com",
                },
              }),
            ],
            nextCursor: query.has("role") ? null : "PAGE_2_CURSOR",
          },
        };
      },
    });
    await fixture.install(page);
    await signInCompany(page);
    await expect(
      page.getByText("first@example.com", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await started.promise;
    await page
      .getByRole("combobox", { name: "Role" })
      .selectOption("VALET_EMPLOYEE");
    await expect(
      page.getByText("filtered@example.com", { exact: true }),
    ).toBeVisible();
    release.resolve();
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByText("filtered@example.com", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("stale-page2@example.com", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("stale page2 failure", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Previous", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Next", exact: true }),
    ).toHaveCount(0);
    expect(fixture.count(directory)).toBe(3);
  });
}
