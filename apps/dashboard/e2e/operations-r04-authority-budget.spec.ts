import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  employeeContext,
  LOCATION_A,
  ORG_A,
  supervisorContext,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { sessionItem, taskItem } from "./support/operations-fixtures";
import { persistentMatches } from "./support/persistent-storage";

const overview = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview`;
const sessionsPath = `${overview}/sessions`;
const tasksPath = `${overview}/tasks`;

test("R04 Location Manager exact granted Location can read Vehicles and Tasks", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === sessionsPath) return { body: { items: [sessionItem()], nextCursor: null } };
      if (path === tasksPath) return { body: { items: [taskItem()], nextCursor: null } };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/vehicles");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByRole("heading", { name: "Vehicles", level: 1 })).toBeVisible();
  await expect(page.getByText("12-34567", { exact: true })).toBeVisible();
  await expect.poll(() => fixture.count(sessionsPath)).toBeGreaterThan(0);

  await page.getByRole("navigation", { name: "Management navigation" })
    .getByRole("link", { name: "Tasks" }).click();
  await expect(page.getByRole("heading", { name: "Tasks", level: 1 })).toBeVisible();
  await expect(page.getByRole("table").getByText("Parking", { exact: true })).toBeVisible();
  await expect.poll(() => fixture.count(tasksPath)).toBeGreaterThan(0);
});

test("R04 All Locations never becomes an aggregate Vehicles or Tasks read", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
  await fixture.install(page);
  await page.goto("/vehicles");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(page.getByText("Select an active exact Location to view this information.")).toBeVisible();
  expect(fixture.count(sessionsPath)).toBe(0);

  await page.goto("/tasks");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(page.getByText("Select an active exact Location to view this information.")).toBeVisible();
  expect(fixture.count(tasksPath)).toBe(0);
});

test("R04 inactive Location can be selected historically but sends no Vehicles or Tasks read", async ({ page }) => {
  const inactive = { ...LOCATION_A, status: "INACTIVE" as const };
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [inactive] },
  });
  await fixture.install(page);
  await page.goto("/vehicles");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: /Main Garage/u }).click();
  await expect(page.getByText("Select an active exact Location to view this information.")).toBeVisible();
  expect(fixture.count(sessionsPath)).toBe(0);

  await page.goto("/tasks");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: /Main Garage/u }).click();
  await expect(page.getByText("Select an active exact Location to view this information.")).toBeVisible();
  expect(fixture.count(tasksPath)).toBe(0);
});

test("R04 Supervisor and Employee never get generic Vehicles or Tasks reads", async ({ page }) => {
  const supervisor = new DashboardApiFixture({ operationalContexts: [supervisorContext()] });
  await supervisor.install(page);
  await page.goto("/vehicles");
  await signInOnCurrentPage(page, "supervisor@example.com");
  const candidate = `${ORG_A.name} · ${LOCATION_A.name}`;
  if (await page.getByRole("button", { name: candidate }).isVisible()) {
    await page.getByRole("button", { name: candidate }).click();
  }
  expect(supervisor.count(sessionsPath)).toBe(0);
  await page.goto("/tasks");
  expect(supervisor.count(tasksPath)).toBe(0);
  await expect(page.getByRole("link", { name: "Tasks" })).toHaveCount(0);

  await page.unrouteAll({ behavior: "wait" });
  const employee = new DashboardApiFixture({ operationalContexts: [employeeContext()] });
  await employee.install(page);
  await page.goto("/vehicles");
  if (await page.getByRole("heading", { name: "Sign in" }).isVisible()) {
    await signInOnCurrentPage(page, "employee@example.com");
  }
  expect(employee.count(sessionsPath)).toBe(0);
  await page.goto("/tasks");
  expect(employee.count(tasksPath)).toBe(0);
  await expect(page.getByRole("heading", { name: "Tasks", level: 1 })).toHaveCount(0);
});

test("R04 unauthenticated direct routes make zero business reads", async ({ page }) => {
  const fixture = new DashboardApiFixture();
  await fixture.install(page);
  await page.goto("/vehicles");
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
  expect(fixture.count(sessionsPath)).toBe(0);
  await page.goto("/tasks");
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
  expect(fixture.count(tasksPath)).toBe(0);
});

test("R04 request budgets settle, local controls stay local, rows stay memory-only, and writes stay zero", async ({ page }) => {
  const sentinel = "R04_STORAGE_SENTINEL_92371";
  const writes: string[] = [];
  const seenPaths: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      seenPaths.push(path);
      if (request.method() !== "GET" && !path.startsWith("/v1/staff/auth/")) {
        writes.push(`${request.method()} ${path}`);
      }
      if (path === sessionsPath) {
        return { body: { items: [sessionItem({ vehicle: { ...sessionItem().vehicle, plateNumberNormalized: null, temporaryDescriptor: sentinel } })], nextCursor: null } };
      }
      if (path === tasksPath) {
        return { body: { items: [taskItem()], nextCursor: null } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/vehicles");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByText(sentinel, { exact: true })).toBeVisible();
  await expect.poll(() => fixture.count(sessionsPath)).toBeGreaterThan(0);
  const sessionsSettled = fixture.count(sessionsPath);
  await page.waitForTimeout(750);
  expect(fixture.count(sessionsPath)).toBe(sessionsSettled);
  await page.getByRole("searchbox").fill("R04_STORAGE");
  expect(fixture.count(sessionsPath)).toBe(sessionsSettled);

  await page.getByRole("navigation", { name: "Management navigation" })
    .getByRole("link", { name: "Tasks" }).click();
  await expect.poll(() => fixture.count(tasksPath)).toBeGreaterThan(0);
  const tasksSettled = fixture.count(tasksPath);
  await page.waitForTimeout(750);
  expect(fixture.count(tasksPath)).toBe(tasksSettled);
  await page.getByRole("combobox", { name: "Type" }).selectOption("PARKING");
  expect(fixture.count(tasksPath)).toBe(tasksSettled);

  expect(writes).toEqual([]);
  for (const forbidden of ["retrieval-queue", "/incidents", "/keys", "visit-contact", "/payment", "route-history", "/custody"]) {
    expect(seenPaths.some((path) => path.includes(forbidden))).toBe(false);
  }
  const storage = await persistentMatches(page, sentinel);
  expect(storage.local).toEqual([]);
  expect(storage.session).toEqual([]);
  expect(storage.indexed).toEqual([]);
  expect(storage.cache).toEqual([]);
});
