import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  employeeContext,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
  supervisorContext,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { persistentMatches } from "./support/persistent-storage";
import {
  activeShift,
  activeShiftsPath,
  STAFF_EMAIL,
  staffItem,
  staffPath,
} from "./support/administration-r05-fixtures";

const directory = staffPath(ORG_A.organizationId);
const shifts = activeShiftsPath(LOCATION_A.locationId);

test("R05 Company Admin All Locations reads Employees but sends zero active-shift reads", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) =>
      path === directory
        ? { body: { items: [staffItem()], nextCursor: null } }
        : path === shifts
          ? { body: { items: [activeShift()], nextCursor: null } }
          : undefined,
  });
  await fixture.install(page);
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(page.getByText(STAFF_EMAIL, { exact: true })).toBeVisible();
  expect(fixture.count(directory)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Shifts" }).click();
  await expect(
    page.getByText("Select a Location to view this information."),
  ).toBeVisible();
  expect(fixture.count(shifts)).toBe(0);
});

test("T05-B Location Manager opens Employees lazily and keeps Shifts exact-location scoped", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) =>
      path === shifts
        ? { body: { items: [activeShift()], nextCursor: null } }
        : path === directory
          ? { body: { items: [staffItem()], nextCursor: null } }
          : undefined,
  });
  await fixture.install(page);
  await page.goto("/employees");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(
    page.getByRole("heading", { name: "Employees & Shifts" }),
  ).toBeVisible();
  await expect(
    page.getByText("View active shifts for the selected Location."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Employees" })).toBeVisible();
  await expect(page.getByText("Active shift", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: LOCATION_B.name })).toHaveCount(
    0,
  );
  expect(fixture.count(directory)).toBe(0);
  expect(fixture.count(shifts)).toBeGreaterThan(0);
  expect(fixture.count(activeShiftsPath(LOCATION_B.locationId))).toBe(0);
  await page.getByRole("button", { name: "Employees", exact: true }).click();
  await expect(page.getByText(STAFF_EMAIL, { exact: true })).toBeVisible();
  expect(fixture.count(directory)).toBe(1);
  const settledShifts = fixture.count(shifts);
  await page.waitForTimeout(400);
  expect(fixture.count(shifts)).toBe(settledShifts);
  await expect(
    page.getByText("Manage staff within your authorized Locations."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Language" }).click();
  await expect(
    page.getByText("إدارة الموظفين ضمن المواقع المصرح لك بها."),
  ).toBeVisible();
});

test("R05 inactive Location sends zero active-shift reads", async ({
  page,
}) => {
  const inactive = { ...LOCATION_A, status: "INACTIVE" as const };
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [inactive] },
    override: (path) =>
      path === shifts
        ? { body: { items: [activeShift()], nextCursor: null } }
        : undefined,
  });
  await fixture.install(page);
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: /Main Garage/u }).click();
  await page.getByRole("button", { name: "Shifts" }).click();
  await expect(
    page.getByText("Select an active Location to view active shifts."),
  ).toBeVisible();
  expect(fixture.count(shifts)).toBe(0);
});

test("R05 Dashboard entitlement denial prevents Employees business reads", async ({
  page,
}) => {
  const subscriptionPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/subscription`;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path) => {
      if (path === subscriptionPath)
        return {
          body: {
            organizationId: ORG_A.organizationId,
            subscription: {
              planCode: "R05",
              status: "ACTIVE",
              entitlements: {
                dashboardAccess: false,
                reportExports: true,
                basicBranding: true,
              },
            },
          },
        };
      if (path === directory)
        return { body: { items: [staffItem()], nextCursor: null } };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await expect(
    page.getByText(
      "Management Dashboard access is unavailable for this authorized scope.",
    ),
  ).toBeVisible();
  expect(fixture.count(directory)).toBe(0);
});

test("R05 Supervisor, Employee, and unauthenticated routes make zero staff business reads", async ({
  page,
}) => {
  for (const [email, context] of [
    ["supervisor@example.com", supervisorContext()],
    ["employee@example.com", employeeContext()],
  ] as const) {
    const fixture = new DashboardApiFixture({ operationalContexts: [context] });
    await fixture.install(page);
    await page.goto("/employees");
    await signInOnCurrentPage(page, email);
    const candidate = `${ORG_A.name} · ${LOCATION_A.name}`;
    if (await page.getByRole("button", { name: candidate }).isVisible()) {
      await page.getByRole("button", { name: candidate }).click();
    }
    expect(fixture.count(directory)).toBe(0);
    expect(fixture.count(shifts)).toBe(0);
    await expect(
      page.getByRole("heading", { name: "Employees & Shifts" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await page.unrouteAll({ behavior: "wait" });
  }

  const unauthenticated = new DashboardApiFixture();
  await unauthenticated.install(page);
  await page.goto("/employees");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(unauthenticated.count(directory)).toBe(0);
  expect(unauthenticated.count(shifts)).toBe(0);
});

test("R05 settles request budget, keeps rows memory-only, and performs no hidden joins or writes", async ({
  page,
}) => {
  const sentinel = "r05-storage-sentinel@example.com";
  const seen: string[] = [];
  const writes: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      seen.push(path);
      if (request.method() !== "GET" && !path.startsWith("/v1/staff/auth/"))
        writes.push(`${request.method()} ${path}`);
      if (path === directory)
        return {
          body: {
            items: [staffItem({ identity: { email: sentinel } })],
            nextCursor: null,
          },
        };
      if (path === shifts)
        return { body: { items: [activeShift()], nextCursor: null } };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByText(sentinel, { exact: true })).toBeVisible();
  const settledDirectory = fixture.count(directory);
  await page.waitForTimeout(650);
  expect(fixture.count(directory)).toBe(settledDirectory);
  await page.getByRole("searchbox").fill("r05-storage");
  await expect.poll(() => fixture.count(directory)).toBe(settledDirectory + 1);

  await page.getByRole("button", { name: "Shifts" }).click();
  await expect(page.getByText("Active shift", { exact: true })).toBeVisible();
  const settledShifts = fixture.count(shifts);
  await page.waitForTimeout(650);
  expect(fixture.count(shifts)).toBe(settledShifts);
  expect(writes).toEqual([]);
  expect(
    seen.some((path) => /\/staff\/[^/]+$/u.test(path) && path !== directory),
  ).toBe(false);
  expect(
    seen
      .filter((path) => path.includes("/active-shifts"))
      .every((path) => path === shifts),
  ).toBe(true);
  const storage = await persistentMatches(page, sentinel);
  expect(storage.local).toEqual([]);
  expect(storage.session).toEqual([]);
  expect(storage.indexed).toEqual([]);
  expect(storage.cache).toEqual([]);
});
