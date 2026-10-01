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

async function openDetail(
  page: Page,
  fixture: DashboardApiFixture,
  exactLocation = false,
) {
  await fixture.install(page);
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", {
      name: exactLocation ? LOCATION_A.name : "All Locations",
    })
    .click();
  await expect(page.getByText(STAFF_EMAIL, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Details: ${STAFF_EMAIL}` }).click();
  return page.getByRole("dialog", { name: "Details" });
}

test("R05 role change sends expectedVersion once, MFA never replays, and explicit retry refreshes", async ({
  page,
}) => {
  const directory = staffPath(ORG_A.organizationId);
  const detailPath = `${directory}/${E2E_IDS.membership}`;
  const rolePath = `${detailPath}/role`;
  const posts: unknown[] = [];
  let changed = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    mfaState: "STEP_UP_REQUIRED",
    override: (path, request, current) => {
      if (path === directory)
        return {
          body: {
            items: [
              staffItem(
                changed ? { role: "LOCATION_MANAGER", version: 2 } : {},
              ),
            ],
            nextCursor: null,
          },
        };
      if (path === detailPath)
        return {
          body: staffDetail(
            changed ? { role: "LOCATION_MANAGER", version: 2 } : {},
          ),
        };
      if (path === rolePath && request.method() === "POST") {
        posts.push(request.postDataJSON());
        if (!current.mfaAssured)
          return {
            status: 403,
            body: {
              code: "MFA_STEP_UP_REQUIRED",
              message: "Fresh MFA is required.",
              requestId: "r05-mfa",
            },
          };
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
  await expect(drawer.getByRole("alert")).toContainText(
    "submit the action again",
  );

  await drawer.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1]).toEqual({ expectedVersion: 1, role: "LOCATION_MANAGER" });
  await expect(
    page.getByRole("table").getByText("Location Manager", { exact: true }),
  ).toBeVisible();
  expect(fixture.count(directory)).toBeGreaterThanOrEqual(2);
  expect(fixture.count(detailPath)).toBeGreaterThanOrEqual(2);
});

test("R05 auth reconciliation never replays a staff mutation without explicit retry", async ({
  page,
}) => {
  const directory = staffPath(ORG_A.organizationId);
  const detailPath = `${directory}/${E2E_IDS.membership}`;
  const rolePath = `${detailPath}/role`;
  const posts: unknown[] = [];
  let changed = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path, request) => {
      if (path === directory)
        return {
          body: {
            items: [
              staffItem(
                changed ? { role: "LOCATION_MANAGER", version: 2 } : {},
              ),
            ],
            nextCursor: null,
          },
        };
      if (path === detailPath)
        return {
          body: staffDetail(
            changed ? { role: "LOCATION_MANAGER", version: 2 } : {},
          ),
        };
      if (path === rolePath && request.method() === "POST") {
        posts.push(request.postDataJSON());
        if (posts.length === 1)
          return {
            status: 401,
            body: {
              code: "STAFF_AUTHENTICATION_REQUIRED",
              message: "Authentication required.",
              requestId: "r05-auth",
            },
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
  await expect(
    page.getByRole("table").getByText("Location Manager", { exact: true }),
  ).toBeVisible();
});

test("R05 entitlement loss while editing denies once and retries only explicitly", async ({
  page,
}) => {
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
        return {
          body: {
            items: [
              staffItem(
                changed ? { role: "LOCATION_MANAGER", version: 2 } : {},
              ),
            ],
            nextCursor: null,
          },
        };
      }
      if (path === detailPath) {
        return {
          body: staffDetail(
            changed ? { role: "LOCATION_MANAGER", version: 2 } : {},
          ),
        };
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

  await expect(drawer.getByRole("alert")).toHaveText(
    "The requested resource is not available.",
  );
  expect(posts).toEqual([{ expectedVersion: 1, role: "LOCATION_MANAGER" }]);
  await expect(
    table.getByText("Valet Employee", { exact: true }),
  ).toBeVisible();
  await expect(
    table.getByText("Location Manager", { exact: true }),
  ).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  expect(posts).toHaveLength(1);

  dashboardEntitled = true;
  await page.waitForLoadState("networkidle");
  expect(posts).toHaveLength(1);
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1]).toEqual({ expectedVersion: 1, role: "LOCATION_MANAGER" });
  await expect(
    table.getByText("Location Manager", { exact: true }),
  ).toBeVisible();
});
