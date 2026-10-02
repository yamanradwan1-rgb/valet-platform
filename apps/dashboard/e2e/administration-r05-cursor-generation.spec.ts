import { expect, test, type Page } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
  ORG_B,
} from "./support/dashboard-api-fixture";
import { deferred, changeOrganization } from "./support/staff-directory-ui";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  enterHistory,
  failure,
  historyPath,
  historyRow,
} from "./support/issue240e-history";
async function enterLm(page: Page) {
  await page.goto("/employees");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
}
for (const mode of ["success", "failure"] as const) {
  for (const authority of ["CA", "LM"] as const) {
    test(`T05-E ${authority} Organization A→B→A fences stale first-A ${mode}`, async ({
      page,
    }) => {
      const started = deferred(),
        release = deferred();
      let calls = 0;
      const fixture = new DashboardApiFixture({
        ...(authority === "CA"
          ? {
              companyOrganizations: [ORG_A, ORG_B],
              companyLocations: {
                [ORG_A.organizationId]: [LOCATION_A],
                [ORG_B.organizationId]: [LOCATION_B],
              },
            }
          : {
              locationManagerOrganizations: [ORG_A, ORG_B],
              locationManagerLocations: {
                [ORG_A.organizationId]: [LOCATION_A],
                [ORG_B.organizationId]: [LOCATION_B],
              },
            }),
        override: async (route) => {
          if (route === historyPath()) {
            if (++calls === 1) {
              started.resolve();
              await release.promise;
              return mode === "failure"
                ? failure()
                : {
                    body: {
                      items: [
                        historyRow({
                          identity: {
                            firstName: "Stale",
                            lastName: "A",
                            email: "stale-a@example.com",
                          },
                        }),
                      ],
                      nextCursor: "STALE_CURSOR",
                    },
                  };
            }
            return { body: { items: [historyRow()], nextCursor: null } };
          }
          if (route === historyPath(ORG_B.organizationId))
            return {
              body: {
                items: [
                  historyRow({
                    identity: {
                      firstName: "Tenant",
                      lastName: "B",
                      email: "b@example.com",
                    },
                    location: {
                      locationId: LOCATION_B.locationId,
                      name: LOCATION_B.name,
                      code: LOCATION_B.code,
                      timezone: LOCATION_B.timezone,
                    },
                  }),
                ],
                nextCursor: null,
              },
            };
          return undefined;
        },
      });
      await fixture.install(page);
      if (authority === "CA") await enterHistory(page);
      else await enterLm(page);
      await started.promise;
      async function change(org: string, loc: string) {
        if (authority === "CA") {
          await changeOrganization(page, org);
          await page
            .getByRole("button", { name: "Shifts", exact: true })
            .click();
        } else {
          await page.locator(".sidebar-scope").click();
          await page.getByRole("button", { name: org, exact: true }).click();
          await page.getByRole("button", { name: loc, exact: true }).click();
        }
      }
      await change(ORG_B.name, LOCATION_B.name);
      await expect(page.getByRole("table")).toContainText("Tenant B");
      await change(ORG_A.name, LOCATION_A.name);
      await expect(page.getByRole("table")).toContainText("Maya O’Connor");
      release.resolve();
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("table")).toContainText("Maya O’Connor");
      await expect(
        page.getByText("stale-a@example.com", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByText("stale history failure", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Next", exact: true }),
      ).toHaveCount(0);
      expect(fixture.count(historyPath())).toBe(2);
      expect(fixture.count(historyPath(ORG_B.organizationId))).toBe(1);
    });
  }
  test(`T05-E pending history ${mode} cannot repaint after logout and same-user sign-in`, async ({
    page,
  }) => {
    const started = deferred(),
      release = deferred();
    let calls = 0;
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      override: async (route) => {
        if (route !== historyPath()) return undefined;
        if (++calls === 1) {
          started.resolve();
          await release.promise;
          return mode === "failure"
            ? failure()
            : {
                body: {
                  items: [
                    historyRow({
                      identity: {
                        firstName: "Old",
                        lastName: "Session",
                        email: "old-session@example.com",
                      },
                    }),
                  ],
                  nextCursor: null,
                },
              };
        }
        return { body: { items: [historyRow()], nextCursor: null } };
      },
    });
    await fixture.install(page);
    await enterHistory(page);
    await started.promise;
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await signInOnCurrentPage(page);
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page
      .getByRole("button", { name: "All Locations", exact: true })
      .click();
    await page.getByRole("button", { name: "Shifts", exact: true }).click();
    await expect(page.getByRole("table")).toContainText("Maya O’Connor");
    release.resolve();
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByText("old-session@example.com", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("stale history failure", { exact: true }),
    ).toHaveCount(0);
    expect(fixture.count(historyPath())).toBe(2);
  });
}
