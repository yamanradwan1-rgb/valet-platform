import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  E2E_IDS,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
  ORG_B,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  activeShift,
  activeShiftsPath,
  STAFF_EMAIL,
  staffItem,
  staffPath,
} from "./support/administration-r05-fixtures";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function signInCompany(page: Page, locationName: string | null = null) {
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: locationName ?? "All Locations" }).click();
}

test("R05 Employees preserves opaque cursors and permanently resets loaded-page controls", async ({ page }) => {
  const path = staffPath(ORG_A.organizationId);
  const seen: Array<string | null> = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (requestPath, request) => {
      if (requestPath !== path) return undefined;
      const cursor = new URL(request.url()).searchParams.get("cursor");
      seen.push(cursor);
      return cursor === null
        ? { body: { items: [staffItem()], nextCursor: "staff_cursor_12345678" } }
        : { body: { items: [staffItem({ identity: { email: "second@example.com" }, membershipId: "77777777-7777-4777-8777-777777777777", role: "ORG_ADMIN" })], nextCursor: null } };
    },
  });
  await fixture.install(page);
  await signInCompany(page);
  await expect(page.getByText(STAFF_EMAIL, { exact: true })).toBeVisible();
  await page.getByRole("searchbox").fill("worker");
  await page.getByRole("combobox", { name: "Role" }).selectOption("VALET_EMPLOYEE");
  await page.getByRole("combobox", { name: "Status" }).selectOption("ACTIVE");

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("second@example.com", { exact: true })).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Role" })).toHaveValue("ALL");
  await expect(page.getByRole("combobox", { name: "Status" })).toHaveValue("ALL");
  expect(seen).toContain("staff_cursor_12345678");
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();

  await page.getByRole("searchbox").fill("second");
  await page.getByRole("combobox", { name: "Role" }).selectOption("ORG_ADMIN");
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.getByText(STAFF_EMAIL, { exact: true })).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Role" })).toHaveValue("ALL");
  await expect(page.getByRole("combobox", { name: "Status" })).toHaveValue("ALL");
  await expect(page.getByText(/Page \d+ of \d+/u)).toHaveCount(0);
});

test("R05 Employees never carries Organization A cursor into B or repaints delayed A", async ({ page }) => {
  const pathA = staffPath(ORG_A.organizationId);
  const pathB = staffPath(ORG_B.organizationId);
  const release = deferred();
  const started = deferred();
  const seenB: Array<string | null> = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A, ORG_B],
    override: async (path, request) => {
      const cursor = new URL(request.url()).searchParams.get("cursor");
      if (path === pathA && cursor === null) return { body: { items: [staffItem()], nextCursor: "org_A_cursor_12345678" } };
      if (path === pathA && cursor) {
        started.resolve(); await release.promise;
        return { body: { items: [staffItem({ identity: { email: "stale-a@example.com" } })], nextCursor: null } };
      }
      if (path === pathB) {
        seenB.push(cursor);
        return { body: { items: [staffItem({ identity: { email: "bravo@example.com" }, membershipId: "88888888-8888-4888-8888-888888888888" })], nextCursor: null } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await signInCompany(page);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await started.promise;
  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await page.getByRole("button", { name: ORG_B.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(page.getByText("bravo@example.com", { exact: true })).toBeVisible();
  expect(seenB.length).toBeGreaterThan(0);
  expect(seenB.every((cursor) => cursor === null)).toBe(true);
  release.resolve();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("stale-a@example.com", { exact: true })).toHaveCount(0);
});

test("R05 Shifts preserves opaque cursor history and never carries Location A cursor into B", async ({ page }) => {
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
          ? { body: { items: [activeShift()], nextCursor: "shift_cursor_12345678" } }
          : { body: { items: [activeShift({ shiftId: "99999999-9999-4999-8999-999999999999", startedAt: "2026-09-21T08:00:00.000Z" })], nextCursor: null } };
      }
      if (path === pathB) {
        seenB.push(cursor);
        return { body: { items: [activeShift({ shiftId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", startedAt: "2026-09-21T09:00:00.000Z" })], nextCursor: null } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await signInCompany(page, LOCATION_A.name);
  await page.getByRole("button", { name: "Shifts" }).click();
  await expect(page.getByText("21 Sept 2026, 10:00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("21 Sept 2026, 11:00", { exact: true })).toBeVisible();
  expect(seenA).toContain("shift_cursor_12345678");
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.getByText("21 Sept 2026, 10:00", { exact: true })).toBeVisible();
  await expect(page.getByText(/Page \d+ of \d+/u)).toHaveCount(0);

  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_B.name }).click();
  await page.getByRole("button", { name: "Shifts" }).click();
  await expect(page.getByText("21 Sept 2026, 12:00", { exact: true })).toBeVisible();
  expect(seenB.every((cursor) => cursor === null)).toBe(true);
});

test("R05 Employees controls reset on scope plus identity/session generation replacement", async ({ page }) => {
  const pathA = staffPath(ORG_A.organizationId);
  const pathB = staffPath(ORG_B.organizationId);
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A, ORG_B],
    override: (path) => {
      if (path === pathA) return { body: { items: [staffItem()], nextCursor: null } };
      if (path === pathB) return { body: { items: [staffItem({ identity: { email: "bravo@example.com" }, membershipId: "88888888-8888-4888-8888-888888888888" })], nextCursor: null } };
      return undefined;
    },
  });
  await fixture.install(page);
  await signInCompany(page);
  await page.getByRole("searchbox").fill("worker");
  await page.getByRole("combobox", { name: "Role" }).selectOption("VALET_EMPLOYEE");
  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await page.getByRole("button", { name: ORG_B.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(page.getByText("bravo@example.com", { exact: true })).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Role" })).toHaveValue("ALL");

  await page.getByRole("searchbox").fill("bravo");
  await page.getByRole("combobox", { name: "Status" }).selectOption("ACTIVE");
  await page.getByRole("button", { name: "Sign out" }).click();
  await signInOnCurrentPage(page, "replacement-admin@example.com");
  await page.getByRole("button", { name: ORG_B.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Status" })).toHaveValue("ALL");
});

for (const mode of ["success", "failure"] as const) {
  test(`R05 Shifts A→B→A fences stale first-A ${mode}`, async ({ page }) => {
    const pathA = activeShiftsPath(LOCATION_A.locationId);
    const pathB = activeShiftsPath(LOCATION_B.locationId);
    const release = deferred(); const started = deferred(); let aCalls = 0;
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
      override: async (path) => {
        if (path === pathA) {
          aCalls += 1;
          if (aCalls === 1) {
            started.resolve(); await release.promise;
            return mode === "success"
              ? { body: { items: [activeShift({ startedAt: "2026-09-21T06:00:00.000Z" })], nextCursor: null } }
              : { status: 503, body: { code: "TEMPORARY", message: "stale shift failure", requestId: "r05-stale" } };
          }
          return { body: { items: [activeShift({ startedAt: "2026-09-21T08:00:00.000Z" })], nextCursor: null } };
        }
        if (path === pathB) return { body: { items: [activeShift({ startedAt: "2026-09-21T09:00:00.000Z" })], nextCursor: null } };
        return undefined;
      },
    });
    await fixture.install(page);
    await signInCompany(page, LOCATION_A.name);
    await page.getByRole("button", { name: "Shifts" }).click();
    await started.promise;
    await changeLocation(page, LOCATION_B.name);
    await page.getByRole("button", { name: "Shifts" }).click();
    await expect(page.getByText("21 Sept 2026, 12:00", { exact: true })).toBeVisible();
    await changeLocation(page, LOCATION_A.name);
    await page.getByRole("button", { name: "Shifts" }).click();
    await expect(page.getByText("21 Sept 2026, 11:00", { exact: true })).toBeVisible();
    release.resolve(); await page.waitForLoadState("networkidle");
    await expect(page.getByText("21 Sept 2026, 09:00", { exact: true })).toHaveCount(0);
    await expect(page.getByText("stale shift failure", { exact: true })).toHaveCount(0);
  });
}

test("R05 pending Shift read cannot repaint after logout", async ({ page }) => {
  const path = activeShiftsPath(LOCATION_A.locationId);
  const release = deferred(); const started = deferred();
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A], companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (requestPath) => {
      if (requestPath !== path) return undefined;
      started.resolve(); await release.promise;
      return { body: { items: [activeShift()], nextCursor: null } };
    },
  });
  await fixture.install(page);
  await signInCompany(page, LOCATION_A.name);
  await page.getByRole("button", { name: "Shifts" }).click();
  await started.promise;
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  release.resolve(); await page.waitForLoadState("networkidle");
  await expect(page.getByText("Active shift", { exact: true })).toHaveCount(0);
});

async function changeLocation(page: Page, locationName: string) {
  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: locationName }).click();
}
