import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
  ORG_B,
} from "./support/dashboard-api-fixture";
import {
  activeShiftsPath,
  STAFF_EMAIL,
  staffDetail,
  staffItem,
  staffPath,
} from "./support/administration-r05-fixtures";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { deferred } from "./support/staff-directory-ui";

const memberB = "88888888-8888-4888-8888-888888888888";
const emailB = "second.employee@example.com";

function grant(location = LOCATION_A) {
  return {
    code: location.code,
    locationId: location.locationId,
    name: location.name,
    status: location.status,
  };
}

async function enterLmEmployees(page: Page) {
  await page.goto("/employees");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await page.getByRole("button", { name: "Employees", exact: true }).click();
}

async function switchLmScope(
  page: Page,
  organization: string,
  location: string,
) {
  await page.locator(".sidebar-scope").click();
  await page.getByRole("button", { name: organization, exact: true }).click();
  await page.getByRole("button", { name: location, exact: true }).click();
  await page.getByRole("button", { name: "Employees", exact: true }).click();
}

for (const mode of ["success", "failure"] as const) {
  test(`T05-B LM A→B→A fences stale first-A ${mode}`, async ({ page }) => {
    const pathA = staffPath(ORG_A.organizationId);
    const pathB = staffPath(ORG_B.organizationId);
    const started = deferred();
    const release = deferred();
    let aCalls = 0;
    const fixture = new DashboardApiFixture({
      locationManagerOrganizations: [ORG_A, ORG_B],
      locationManagerLocations: {
        [ORG_A.organizationId]: [LOCATION_A],
        [ORG_B.organizationId]: [LOCATION_B],
      },
      override: async (path) => {
        if (
          path === activeShiftsPath(LOCATION_A.locationId) ||
          path === activeShiftsPath(LOCATION_B.locationId)
        )
          return { body: { items: [], nextCursor: null } };
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
                    message: "stale lm employee failure",
                    requestId: "240b-a-stale",
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
        if (path === pathB)
          return {
            body: {
              items: [
                staffItem({ identity: { email: "fresh-b@example.com" } }),
              ],
              nextCursor: null,
            },
          };
        return undefined;
      },
    });
    await fixture.install(page);
    await enterLmEmployees(page);
    await started.promise;
    await switchLmScope(page, ORG_B.name, LOCATION_B.name);
    await expect(
      page.getByText("fresh-b@example.com", { exact: true }),
    ).toBeVisible();
    await switchLmScope(page, ORG_A.name, LOCATION_A.name);
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
      page.getByText("stale lm employee failure", { exact: true }),
    ).toHaveCount(0);
  });
}

for (const mode of ["success", "failure"] as const) {
  test(`T05-B grant page late ${mode} cannot repaint after target A→B`, async ({
    page,
  }) => {
    const directory = staffPath(ORG_A.organizationId);
    const detailA = `${directory}/${staffItem().membershipId}`;
    const detailB = `${directory}/${memberB}`;
    const pageA = `${detailA}/location-access`;
    const pageB = `${detailB}/location-access`;
    const started = deferred();
    const release = deferred();
    const fixture = new DashboardApiFixture({
      locationManagerOrganizations: [ORG_A],
      locationManagerLocations: {
        [ORG_A.organizationId]: [LOCATION_A, LOCATION_B],
      },
      override: async (path) => {
        if (path === activeShiftsPath(LOCATION_A.locationId))
          return { body: { items: [], nextCursor: null } };
        if (path === directory)
          return {
            body: {
              items: [
                staffItem(),
                staffItem({
                  membershipId: memberB,
                  identity: { email: emailB },
                }),
              ],
              nextCursor: null,
            },
          };
        if (path === detailA) return { body: staffDetail() };
        if (path === detailB)
          return {
            body: staffDetail({
              membershipId: memberB,
              identity: { email: emailB },
            }),
          };
        if (path === pageA) {
          started.resolve();
          await release.promise;
          return mode === "success"
            ? { body: { items: [grant(LOCATION_A)], nextCursor: null } }
            : {
                status: 503,
                body: {
                  code: "TEMPORARY",
                  message: "stale grant failure",
                  requestId: "240b-grant",
                },
              };
        }
        if (path === pageB)
          return { body: { items: [grant(LOCATION_B)], nextCursor: null } };
        return undefined;
      },
    });
    await fixture.install(page);
    await enterLmEmployees(page);
    await page.getByRole("button", { name: `Details: ${STAFF_EMAIL}` }).click();
    await started.promise;
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: `Details: ${emailB}` }).click();
    const drawer = page.getByRole("dialog");
    await expect(
      drawer.getByText(LOCATION_B.name, { exact: true }),
    ).toBeVisible();
    release.resolve();
    await page.waitForLoadState("networkidle");
    await expect(
      drawer.getByText(LOCATION_B.name, { exact: true }),
    ).toBeVisible();
    await expect(
      drawer.getByText(LOCATION_A.name, { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("stale grant failure", { exact: true }),
    ).toHaveCount(0);
  });
}
