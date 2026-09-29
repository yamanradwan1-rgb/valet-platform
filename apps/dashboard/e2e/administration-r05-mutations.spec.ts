import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  E2E_IDS,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  STAFF_EMAIL,
  staffDetail,
  staffItem,
  staffPath,
} from "./support/administration-r05-fixtures";

async function openDetail(page: Page, fixture: DashboardApiFixture, exactLocation = false) {
  await fixture.install(page);
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: exactLocation ? LOCATION_A.name : "All Locations" }).click();
  await expect(page.getByText(STAFF_EMAIL, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Details: ${STAFF_EMAIL}` }).click();
  return page.getByRole("dialog", { name: "Details" });
}

test("R05 role change sends expectedVersion once, MFA never replays, and explicit retry refreshes", async ({ page }) => {
  const directory = staffPath(ORG_A.organizationId);
  const detailPath = `${directory}/${E2E_IDS.membership}`;
  const rolePath = `${detailPath}/role`;
  const posts: unknown[] = [];
  let changed = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    mfaState: "STEP_UP_REQUIRED",
    override: (path, request, current) => {
      if (path === directory) return { body: { items: [staffItem(changed ? { role: "LOCATION_MANAGER", version: 2 } : {})], nextCursor: null } };
      if (path === detailPath) return { body: staffDetail(changed ? { role: "LOCATION_MANAGER", version: 2 } : {}) };
      if (path === rolePath && request.method() === "POST") {
        posts.push(request.postDataJSON());
        if (!current.mfaAssured) return { status: 403, body: { code: "MFA_STEP_UP_REQUIRED", message: "Fresh MFA is required.", requestId: "r05-mfa" } };
        changed = true;
        return { body: staffDetail({ role: "LOCATION_MANAGER", version: 2 }) };
      }
      return undefined;
    },
  });
  const drawer = await openDetail(page, fixture);
  await drawer.getByLabel("Role").selectOption("LOCATION_MANAGER");
  await drawer.getByRole("button", { name: "Save" }).click();
  expect(posts).toEqual([{ expectedVersion: 1, role: "LOCATION_MANAGER" }]);

  const mfa = page.getByRole("dialog", { name: "Verification required" });
  await expect(mfa).toBeVisible();
  await mfa.getByLabel("6-digit authenticator code").fill("123456");
  await mfa.getByRole("button", { name: "Verify" }).click();
  await expect(mfa).toHaveCount(0);
  expect(posts).toHaveLength(1);
  await expect(drawer.getByRole("alert")).toContainText("submit the action again");

  await drawer.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1]).toEqual({ expectedVersion: 1, role: "LOCATION_MANAGER" });
  await expect(page.getByRole("table").getByText("Location Manager", { exact: true })).toBeVisible();
  expect(fixture.count(directory)).toBeGreaterThanOrEqual(2);
  expect(fixture.count(detailPath)).toBeGreaterThanOrEqual(2);
});

test("R05 auth reconciliation never replays a staff mutation without explicit retry", async ({ page }) => {
  const directory = staffPath(ORG_A.organizationId);
  const detailPath = `${directory}/${E2E_IDS.membership}`;
  const rolePath = `${detailPath}/role`;
  const posts: unknown[] = [];
  let changed = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path, request) => {
      if (path === directory) return { body: { items: [staffItem(changed ? { role: "LOCATION_MANAGER", version: 2 } : {})], nextCursor: null } };
      if (path === detailPath) return { body: staffDetail(changed ? { role: "LOCATION_MANAGER", version: 2 } : {}) };
      if (path === rolePath && request.method() === "POST") {
        posts.push(request.postDataJSON());
        if (posts.length === 1) return {
          status: 401,
          body: { code: "STAFF_AUTHENTICATION_REQUIRED", message: "Authentication required.", requestId: "r05-auth" },
        };
        changed = true;
        return { body: staffDetail({ role: "LOCATION_MANAGER", version: 2 }) };
      }
      return undefined;
    },
  });
  const drawer = await openDetail(page, fixture);
  const refreshPath = "/v1/staff/auth/refresh";
  const refreshesBefore = fixture.count(refreshPath);
  await drawer.getByLabel("Role").selectOption("LOCATION_MANAGER");
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(drawer).toHaveCount(0);
  expect(posts).toHaveLength(1);
  expect(fixture.count(refreshPath)).toBe(refreshesBefore + 1);

  await expect(page.getByText(STAFF_EMAIL, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Details: ${STAFF_EMAIL}` }).click();
  const retryDrawer = page.getByRole("dialog", { name: "Details" });
  await retryDrawer.getByLabel("Role").selectOption("LOCATION_MANAGER");
  await retryDrawer.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[0]).toEqual({ expectedVersion: 1, role: "LOCATION_MANAGER" });
  expect(posts[1]).toEqual(posts[0]);
  await expect(page.getByRole("table").getByText("Location Manager", { exact: true })).toBeVisible();
});

test("R05 entitlement loss while editing denies once and retries only explicitly", async ({ page }) => {
  const directory = staffPath(ORG_A.organizationId);
  const detailPath = `${directory}/${E2E_IDS.membership}`;
  const rolePath = `${detailPath}/role`;
  const posts: unknown[] = [];
  let dashboardEntitled = true;
  let changed = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path, request) => {
      if (path === directory) {
        return { body: { items: [staffItem(changed ? { role: "LOCATION_MANAGER", version: 2 } : {})], nextCursor: null } };
      }
      if (path === detailPath) {
        return { body: staffDetail(changed ? { role: "LOCATION_MANAGER", version: 2 } : {}) };
      }
      if (path === rolePath && request.method() === "POST") {
        posts.push(request.postDataJSON());
        if (!dashboardEntitled) {
          return {
            status: 404,
            body: {
              code: "AUTHORIZATION_DENIED",
              message: "The requested resource is not available.",
              requestId: "r05-entitlement",
            },
          };
        }
        changed = true;
        return { body: staffDetail({ role: "LOCATION_MANAGER", version: 2 }) };
      }
      return undefined;
    },
  });
  const drawer = await openDetail(page, fixture);
  const table = page.getByRole("table");
  await drawer.getByLabel("Role").selectOption("LOCATION_MANAGER");
  dashboardEntitled = false;
  await drawer.getByRole("button", { name: "Save" }).click();

  await expect(drawer.getByRole("alert")).toHaveText("The requested resource is not available.");
  expect(posts).toEqual([{ expectedVersion: 1, role: "LOCATION_MANAGER" }]);
  await expect(table.getByText("Valet Employee", { exact: true })).toBeVisible();
  await expect(table.getByText("Location Manager", { exact: true })).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  expect(posts).toHaveLength(1);

  dashboardEntitled = true;
  await page.waitForLoadState("networkidle");
  expect(posts).toHaveLength(1);
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1]).toEqual({ expectedVersion: 1, role: "LOCATION_MANAGER" });
  await expect(table.getByText("Location Manager", { exact: true })).toBeVisible();
});

test("R05 status mutation preserves last-admin and handover denials before explicit success", async ({ page }) => {
  const directory = staffPath(ORG_A.organizationId);
  const detailPath = `${directory}/${E2E_IDS.membership}`;
  const statusPath = `${detailPath}/deactivate`;
  const posts: unknown[] = [];
  let inactive = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path, request) => {
      if (path === directory) return { body: { items: [staffItem(inactive ? { status: "INACTIVE", version: 2 } : {})], nextCursor: null } };
      if (path === detailPath) return { body: staffDetail(inactive ? { status: "INACTIVE", version: 2 } : {}) };
      if (path === statusPath && request.method() === "POST") {
        posts.push(request.postDataJSON());
        if (posts.length === 1) return { status: 409, body: { code: "LAST_USABLE_ADMIN_REQUIRED", message: "Another usable Company Admin is required.", requestId: "last-admin" } };
        if (posts.length === 2) return { status: 409, body: { code: "STAFF_HANDOVER_REQUIRED", message: "Operational handover is required before this change.", requestId: "handover" } };
        inactive = true;
        return { body: staffDetail({ status: "INACTIVE", version: 2 }) };
      }
      return undefined;
    },
  });
  const drawer = await openDetail(page, fixture);
  const deactivate = drawer.getByRole("button", { name: "Deactivate membership" });
  await deactivate.click();
  await expect(drawer.getByRole("alert")).toHaveText("Another usable Company Admin is required.");
  await deactivate.click();
  await expect(drawer.getByRole("alert")).toHaveText("Operational handover is required before this change.");
  await deactivate.click();
  await expect(page.getByRole("table").getByText("Inactive", { exact: true })).toBeVisible();
  expect(posts).toEqual([{ expectedVersion: 1 }, { expectedVersion: 1 }, { expectedVersion: 1 }]);
});

test("R05 truncated grants stay explicitly incomplete and known-grant double submit dispatches once", async ({ page }) => {
  const directory = staffPath(ORG_A.organizationId);
  const detailPath = `${directory}/${E2E_IDS.membership}`;
  const revokePath = `${detailPath}/location-access/revoke`;
  const posts: unknown[] = [];
  const truncated = staffDetail({
    locationAccessCount: 101,
    locationAccess: {
      items: [{ locationId: LOCATION_A.locationId, name: LOCATION_A.name, status: "ACTIVE" }],
      totalCount: 101,
      truncated: true,
    },
  });
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === directory) return { body: { items: [staffItem({ locationAccessCount: 101 })], nextCursor: null } };
      if (path === detailPath) return { body: truncated };
      if (path === revokePath && request.method() === "POST") {
        posts.push(request.postDataJSON());
        return { body: truncated, delayMs: 250 };
      }
      return undefined;
    },
  });
  const drawer = await openDetail(page, fixture, true);
  await expect(drawer.getByText(/Additional Location grants are not shown/u)).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Grant selected Location" })).toHaveCount(0);
  const revoke = drawer.getByRole("button", { name: "Revoke" });
  await revoke.dblclick();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ expectedVersion: 1, locationIds: [LOCATION_A.locationId] });
});

test("R05 Location grant sends the exact selected Location and expectedVersion", async ({ page }) => {
  const directory = staffPath(ORG_A.organizationId);
  const detailPath = `${directory}/${E2E_IDS.membership}`;
  const grantPath = `${detailPath}/location-access/grant`;
  const posts: unknown[] = [];
  let granted = false;
  const emptyDetail = staffDetail({
    locationAccessCount: 0,
    locationAccess: { items: [], totalCount: 0, truncated: false },
  });
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === directory) return { body: { items: [staffItem({ locationAccessCount: granted ? 1 : 0, version: granted ? 2 : 1 })], nextCursor: null } };
      if (path === detailPath) return { body: granted ? staffDetail({ version: 2 }) : emptyDetail };
      if (path === grantPath && request.method() === "POST") {
        posts.push(request.postDataJSON()); granted = true;
        return { body: staffDetail({ version: 2 }) };
      }
      return undefined;
    },
  });
  const drawer = await openDetail(page, fixture, true);
  await drawer.getByRole("button", { name: "Grant selected Location" }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ expectedVersion: 1, locationIds: [LOCATION_A.locationId] });
  await expect(page.getByRole("table").getByText("1", { exact: true })).toBeVisible();
});
