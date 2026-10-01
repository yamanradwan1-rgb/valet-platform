import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  activeShift,
  activeShiftsPath,
} from "./support/administration-r05-fixtures";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function signInCompany(page: Page, locationName: string | null = null) {
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", { name: locationName ?? "All Locations" })
    .click();
}

test("R05 Shifts preserves opaque cursor history and never carries Location A cursor into B", async ({
  page,
}) => {
  const pathA = activeShiftsPath(LOCATION_A.locationId);
  const pathB = activeShiftsPath(LOCATION_B.locationId);
  const seenA: Array<string | null> = [];
  const seenB: Array<string | null> = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path, request) => {
      const cursor = new URL(request.url()).searchParams.get("cursor");
      if (path === pathA) {
        seenA.push(cursor);
        return cursor === null
          ? {
              body: {
                items: [activeShift()],
                nextCursor: "shift_cursor_12345678",
              },
            }
          : {
              body: {
                items: [
                  activeShift({
                    shiftId: "99999999-9999-4999-8999-999999999999",
                    startedAt: "2026-09-21T08:00:00.000Z",
                  }),
                ],
                nextCursor: null,
              },
            };
      }
      if (path === pathB) {
        seenB.push(cursor);
        return {
          body: {
            items: [
              activeShift({
                shiftId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                startedAt: "2026-09-21T09:00:00.000Z",
              }),
            ],
            nextCursor: null,
          },
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await signInCompany(page, LOCATION_A.name);
  await page.getByRole("button", { name: "Shifts" }).click();
  await expect(
    page.getByText("21 Sept 2026, 10:00", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByText("21 Sept 2026, 11:00", { exact: true }),
  ).toBeVisible();
  expect(seenA).toContain("shift_cursor_12345678");
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(
    page.getByText("21 Sept 2026, 10:00", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Page \d+ of \d+/u)).toHaveCount(0);

  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope" })
    .click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_B.name }).click();
  await page.getByRole("button", { name: "Shifts" }).click();
  await expect(
    page.getByText("21 Sept 2026, 12:00", { exact: true }),
  ).toBeVisible();
  expect(seenB.every((cursor) => cursor === null)).toBe(true);
});

for (const mode of ["success", "failure"] as const) {
  test(`R05 Shifts A→B→A fences stale first-A ${mode}`, async ({ page }) => {
    const pathA = activeShiftsPath(LOCATION_A.locationId);
    const pathB = activeShiftsPath(LOCATION_B.locationId);
    const release = deferred();
    const started = deferred();
    let aCalls = 0;
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
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
                      activeShift({ startedAt: "2026-09-21T06:00:00.000Z" }),
                    ],
                    nextCursor: null,
                  },
                }
              : {
                  status: 503,
                  body: {
                    code: "TEMPORARY",
                    message: "stale shift failure",
                    requestId: "r05-stale",
                  },
                };
          }
          return {
            body: {
              items: [activeShift({ startedAt: "2026-09-21T08:00:00.000Z" })],
              nextCursor: null,
            },
          };
        }
        if (path === pathB)
          return {
            body: {
              items: [activeShift({ startedAt: "2026-09-21T09:00:00.000Z" })],
              nextCursor: null,
            },
          };
        return undefined;
      },
    });
    await fixture.install(page);
    await signInCompany(page, LOCATION_A.name);
    await page.getByRole("button", { name: "Shifts" }).click();
    await started.promise;
    await changeLocation(page, LOCATION_B.name);
    await page.getByRole("button", { name: "Shifts" }).click();
    await expect(
      page.getByText("21 Sept 2026, 12:00", { exact: true }),
    ).toBeVisible();
    await changeLocation(page, LOCATION_A.name);
    await page.getByRole("button", { name: "Shifts" }).click();
    await expect(
      page.getByText("21 Sept 2026, 11:00", { exact: true }),
    ).toBeVisible();
    release.resolve();
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByText("21 Sept 2026, 09:00", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("stale shift failure", { exact: true }),
    ).toHaveCount(0);
  });
}

test("R05 pending Shift read cannot repaint after logout", async ({ page }) => {
  const path = activeShiftsPath(LOCATION_A.locationId);
  const release = deferred();
  const started = deferred();
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (requestPath) => {
      if (requestPath !== path) return undefined;
      started.resolve();
      await release.promise;
      return { body: { items: [activeShift()], nextCursor: null } };
    },
  });
  await fixture.install(page);
  await signInCompany(page, LOCATION_A.name);
  await page.getByRole("button", { name: "Shifts" }).click();
  await started.promise;
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  release.resolve();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Active shift", { exact: true })).toHaveCount(0);
});

async function changeLocation(page: Page, locationName: string) {
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope" })
    .click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: locationName }).click();
}
