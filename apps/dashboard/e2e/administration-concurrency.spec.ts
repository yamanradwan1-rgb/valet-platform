import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  E2E_IDS,
  ORG_A,
  ORG_B,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

const STAFF_EMAIL = "worker@example.com";
const CREATED_LOCATION_ID = "55555555-5555-4555-8555-555555555555";

async function enterCompanyAllLocations(
  page: Page,
  path: string,
): Promise<void> {
  await page.goto(path);
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
}

function createdLocationLifecycle() {
  return {
    organizationId: ORG_A.organizationId,
    locationId: CREATED_LOCATION_ID,
    name: "Concurrency Garage",
    code: "CONCURRENCY",
    addressText: "1 Test Street",
    timezone: "Asia/Amman",
    currency: "JOD",
    status: "INACTIVE",
    acceptingIntake: false,
    updatedAt: "2026-09-21T10:00:00Z",
    readiness: {
      readyForActivation: true,
      checks: { currencySupported: true, timezoneValid: true },
    },
    drain: {
      blocked: false,
      activeShiftPresent: false,
      nonCompletedValetSessionPresent: false,
      nonTerminalTaskPresent: false,
    },
  } as const;
}

function staffProjection(
  role: "VALET_EMPLOYEE" | "VALET_SUPERVISOR",
  version: number,
) {
  return {
    identity: { email: STAFF_EMAIL, firstName: null, lastName: null },
    locationAccessCount: 0,
    membershipId: E2E_IDS.membership,
    role,
    status: "ACTIVE" as const,
    version,
  };
}

function staffDetail(
  role: "VALET_EMPLOYEE" | "VALET_SUPERVISOR",
  version: number,
) {
  return {
    ...staffProjection(role, version),
    locationAccess: { items: [], totalCount: 0, truncated: false },
  };
}

function integrations(
  organizationId: string,
  status: "DEGRADED" | "OPERATIONAL",
) {
  return {
    organizationId,
    integrations: [
      { key: "PLATE_OCR", status },
      { key: "STAFF_PUSH", status },
      { key: "DIGITAL_PAYMENT", status },
    ],
  } as const;
}

test("Location create keeps one operationId after an unknown first outcome", async ({
  page,
}) => {
  const createPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/locations`;
  const postBodies: unknown[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [] },
    override: (path, request) => {
      if (path !== createPath || request.method() !== "POST") return undefined;
      postBodies.push(request.postDataJSON());
      if (postBodies.length === 1) {
        return {
          status: 503,
          body: {
            code: "UNKNOWN_OUTCOME",
            message: "Create outcome is unknown.",
            requestId: "create-unknown",
          },
        };
      }
      return { body: createdLocationLifecycle() };
    },
  });
  await fixture.install(page);
  await enterCompanyAllLocations(page, "/locations");

  await page.getByRole("button", { name: "Add Location" }).click();
  const dialog = page.getByRole("dialog", { name: "Create Location" });
  await dialog.getByLabel("Name").fill("Concurrency Garage");
  await dialog.getByLabel("Code").fill("CONCURRENCY");
  await dialog.getByLabel("Address").fill("1 Test Street");
  await dialog.getByLabel("Timezone").fill("Asia/Amman");
  await dialog.getByLabel("Currency").fill("JOD");

  await dialog.getByRole("button", { name: "Create Location" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Create outcome is unknown.",
  );
  await expect(dialog).toBeVisible();
  expect(postBodies).toHaveLength(1);

  await dialog.getByRole("button", { name: "Create Location" }).click();
  await expect.poll(() => postBodies.length).toBe(2);
  expect(postBodies[1]).toEqual(postBodies[0]);
  const first = postBodies[0] as Record<string, unknown>;
  expect(first.operationId).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/u));
  await expect(dialog).toHaveCount(0);
});

test("staff role conflict reloads authoritative detail without local success", async ({
  page,
}) => {
  const staffPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/staff`;
  const detailPath = `${staffPath}/${E2E_IDS.membership}`;
  const rolePath = `${detailPath}/role`;
  let conflicted = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [] },
    override: (path, request) => {
      if (path === staffPath && request.method() === "GET") {
        const item = conflicted
          ? staffProjection("VALET_SUPERVISOR", 2)
          : staffProjection("VALET_EMPLOYEE", 1);
        return { body: { items: [item], nextCursor: null } };
      }
      if (path === detailPath && request.method() === "GET") {
        return {
          body: conflicted
            ? staffDetail("VALET_SUPERVISOR", 2)
            : staffDetail("VALET_EMPLOYEE", 1),
        };
      }
      if (path === rolePath && request.method() === "POST") {
        conflicted = true;
        return {
          status: 409,
          body: {
            code: "VERSION_CONFLICT",
            message: "Version conflict.",
            requestId: "staff-conflict",
          },
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await enterCompanyAllLocations(page, "/employees");

  await page.getByRole("button", { name: `Details: ${STAFF_EMAIL}` }).click();
  const drawer = page.getByRole("dialog", { name: "Details" });
  await expect(drawer.getByText("1", { exact: true })).toBeVisible();
  await drawer.getByLabel("Role").selectOption("LOCATION_MANAGER");
  await drawer.getByRole("button", { name: "Save" }).click();

  await expect(drawer.getByRole("alert")).toHaveText("Version conflict.");
  await expect.poll(() => fixture.count(detailPath)).toBeGreaterThanOrEqual(2);
  await expect(drawer.getByText("2", { exact: true })).toBeVisible();
  const row = page.locator("tbody tr").filter({ hasText: STAFF_EMAIL });
  await expect(row).toContainText("Valet Supervisor");
  await expect(row).not.toContainText("Location Manager");
});

test("delayed Integrations read cannot repopulate after Organization scope change", async ({
  page,
}) => {
  const oldPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/integrations`;
  const newPath = `/v1/staff/management/organizations/${ORG_B.organizationId}/integrations`;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A, ORG_B],
    companyLocations: {
      [ORG_A.organizationId]: [],
      [ORG_B.organizationId]: [],
    },
    override: (path) => {
      if (path === oldPath)
        return {
          body: integrations(ORG_A.organizationId, "DEGRADED"),
          delayMs: 450,
        };
      if (path === newPath)
        return { body: integrations(ORG_B.organizationId, "OPERATIONAL") };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/integrations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();

  const oldRequest = page.waitForRequest(
    (request) => new URL(request.url()).pathname === oldPath,
  );
  await page.getByRole("button", { name: "All Locations" }).click();
  await oldRequest;
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope" })
    .click();
  await page.getByRole("button", { name: ORG_B.name }).click();
  const newRequest = page.waitForRequest(
    (request) => new URL(request.url()).pathname === newPath,
  );
  await page.getByRole("button", { name: "All Locations" }).click();
  await newRequest;

  await expect(
    page.getByRole("heading", { name: "Integrations & Connectors" }),
  ).toBeVisible();
  await expect(page.getByText("Operational", { exact: true })).toHaveCount(3);
  await page.waitForTimeout(550);
  await expect(page.getByText("Operational", { exact: true })).toHaveCount(3);
  await expect(page.getByText("Degraded", { exact: true })).toHaveCount(0);
});
