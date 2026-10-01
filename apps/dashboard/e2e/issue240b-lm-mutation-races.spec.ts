import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
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

function grant() {
  return {
    code: LOCATION_A.code,
    locationId: LOCATION_A.locationId,
    name: LOCATION_A.name,
    status: LOCATION_A.status,
  };
}

async function enterLmEmployees(page: Page) {
  await page.goto("/employees");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await page.getByRole("button", { name: "Employees", exact: true }).click();
}

test("T05-B MFA callback after target switch is fenced and never replays the old POST", async ({
  page,
}) => {
  const directory = staffPath(ORG_A.organizationId);
  const detailA = `${directory}/${staffItem().membershipId}`;
  const detailB = `${directory}/${memberB}`;
  const stepStarted = deferred();
  const releaseStep = deferred();
  let posts = 0;
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    mfaState: "STEP_UP_REQUIRED",
    override: async (path, request) => {
      if (path === activeShiftsPath(LOCATION_A.locationId))
        return { body: { items: [], nextCursor: null } };
      if (path === directory)
        return {
          body: {
            items: [
              staffItem(),
              staffItem({ membershipId: memberB, identity: { email: emailB } }),
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
      if (
        path === `${detailA}/location-access` ||
        path === `${detailB}/location-access`
      )
        return { body: { items: [grant()], nextCursor: null } };
      if (path === `${detailA}/role` && request.method() === "POST") {
        posts += 1;
        return {
          status: 403,
          body: {
            code: "MFA_STEP_UP_REQUIRED",
            message: "Verification required",
            requestId: "240b-mfa",
          },
        };
      }
      if (path === "/v1/staff/auth/mfa/step-up") {
        stepStarted.resolve();
        await releaseStep.promise;
        return { body: { state: "ASSURED" } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await enterLmEmployees(page);
  await page.getByRole("button", { name: `Details: ${STAFF_EMAIL}` }).click();
  const first = page.getByRole("dialog").last();
  await first
    .getByRole("combobox", { name: "Role" })
    .selectOption("VALET_SUPERVISOR");
  await first.getByRole("button", { name: "Save" }).click();
  const mfa = page.getByRole("dialog", { name: "Verification required" });
  await mfa.getByLabel("6-digit authenticator code").fill("123456");
  await mfa.getByRole("button", { name: "Verify" }).click();
  await stepStarted.promise;
  await page
    .getByRole("button", { name: `Details: ${emailB}` })
    .evaluate((node) => (node as HTMLElement).click());
  releaseStep.resolve();
  await expect(
    page.getByRole("dialog").last().getByText(emailB, { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(200);
  expect(posts).toBe(1);
  await expect(
    page.getByText(
      "Verification succeeded. Review the values and submit the action again.",
    ),
  ).toHaveCount(0);
});

test("T05-B conflict refreshes authority state and requires a second explicit submit", async ({
  page,
}) => {
  const directory = staffPath(ORG_A.organizationId);
  const detail = `${directory}/${staffItem().membershipId}`;
  const refreshStarted = deferred();
  const releaseRefresh = deferred();
  let version = 1;
  let detailReads = 0;
  let posts = 0;
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (path, request) => {
      if (path === activeShiftsPath(LOCATION_A.locationId))
        return { body: { items: [], nextCursor: null } };
      if (path === directory)
        return { body: { items: [staffItem({ version })], nextCursor: null } };
      if (path === detail) {
        detailReads += 1;
        if (detailReads === 2) {
          refreshStarted.resolve();
          await releaseRefresh.promise;
        }
        return { body: staffDetail({ version }) };
      }
      if (path === `${detail}/location-access`)
        return { body: { items: [grant()], nextCursor: null } };
      if (path === `${detail}/role` && request.method() === "POST") {
        posts += 1;
        if (posts === 1) {
          version = 2;
          return {
            status: 409,
            body: {
              code: "VERSION_CONFLICT",
              message: "Review refreshed staff state.",
              requestId: "240b-cas",
            },
          };
        }
        version = 3;
        return { body: staffDetail({ role: "VALET_SUPERVISOR", version }) };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await enterLmEmployees(page);
  await page.getByRole("button", { name: `Details: ${STAFF_EMAIL}` }).click();
  const drawer = page.getByRole("dialog");
  await drawer
    .getByRole("combobox", { name: "Role" })
    .selectOption("VALET_SUPERVISOR");
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(drawer.getByRole("alert")).toContainText(
    "Review refreshed staff state.",
  );
  await refreshStarted.promise;
  expect(posts).toBe(1);
  const save = drawer.getByRole("button", { name: "Save" });
  await expect(save).toBeDisabled();
  releaseRefresh.resolve();
  await expect(save).toBeEnabled();
  await save.click();
  await expect.poll(() => posts).toBe(2);
  await expect(drawer.getByRole("combobox", { name: "Role" })).toHaveValue(
    "VALET_SUPERVISOR",
  );
});

test("T05-B grant conflict reloads before explicit retry", async ({ page }) => {
  const directory = staffPath(ORG_A.organizationId);
  const detail = `${directory}/${staffItem().membershipId}`;
  const grants = `${detail}/location-access`;
  const revoke = `${grants}/revoke`;
  const refreshStarted = deferred();
  const releaseRefresh = deferred();
  let version = 1;
  let detailReads = 0;
  let grantReads = 0;
  const posts: Array<{ expectedVersion: number; locationIds: string[] }> = [];
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: {
      [ORG_A.organizationId]: [LOCATION_A, LOCATION_B],
    },
    override: async (path, request) => {
      if (path === activeShiftsPath(LOCATION_A.locationId))
        return { body: { items: [], nextCursor: null } };
      if (path === directory)
        return { body: { items: [staffItem({ version })], nextCursor: null } };
      if (path === detail) {
        detailReads += 1;
        if (detailReads === 2) {
          refreshStarted.resolve();
          await releaseRefresh.promise;
        }
        return { body: staffDetail({ version }) };
      }
      if (path === grants && request.method() === "GET") {
        grantReads += 1;
        return {
          body: {
            items: [
              grant(),
              ...(version > 1
                ? [
                    {
                      code: LOCATION_B.code,
                      locationId: LOCATION_B.locationId,
                      name: LOCATION_B.name,
                      status: LOCATION_B.status,
                    },
                  ]
                : []),
            ],
            nextCursor: null,
          },
        };
      }
      if (path === revoke && request.method() === "POST") {
        const body = request.postDataJSON() as {
          expectedVersion: number;
          locationIds: string[];
        };
        posts.push(body);
        if (posts.length === 1) {
          version = 2;
          return {
            status: 409,
            body: {
              code: "VERSION_CONFLICT",
              message: "Review refreshed staff state.",
              requestId: "240b-grant-conflict",
            },
          };
        }
        version = 3;
        return { body: staffDetail({ version }) };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await enterLmEmployees(page);
  await page.getByRole("button", { name: `Details: ${STAFF_EMAIL}` }).click();
  const drawer = page.getByRole("dialog");
  await drawer
    .locator("label")
    .filter({ hasText: LOCATION_A.name })
    .getByRole("checkbox")
    .check();
  await drawer.getByRole("button", { name: "Revoke" }).click();
  await refreshStarted.promise;
  await expect.poll(() => grantReads).toBeGreaterThan(1);
  await expect(
    drawer.getByText(LOCATION_B.name, { exact: true }),
  ).toBeVisible();
  expect(posts).toHaveLength(1);
  await expect(drawer.getByRole("checkbox").first()).toBeDisabled();
  releaseRefresh.resolve();
  await expect(drawer.getByRole("checkbox").first()).toBeEnabled();
  await drawer
    .locator("label")
    .filter({ hasText: LOCATION_A.name })
    .getByRole("checkbox")
    .check();
  await drawer.getByRole("button", { name: "Revoke" }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1]).toEqual({
    expectedVersion: 2,
    locationIds: [LOCATION_A.locationId],
  });
});
