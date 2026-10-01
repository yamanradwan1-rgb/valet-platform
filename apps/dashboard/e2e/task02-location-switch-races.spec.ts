import { expect, test, type Page, type Request } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

const contextPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/context`;
const locationsPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/locations`;

async function enterCompany(
  page: Page,
  fixture: DashboardApiFixture,
  path: string,
  scope: "all" | "a",
) {
  await fixture.install(page);
  await page.goto(path);
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", {
      name: scope === "all" ? "All Locations" : LOCATION_A.name,
    })
    .click();
}

async function openMenu(page: Page) {
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope" })
    .click();
  await expect(
    page.getByRole("listbox", { name: "Select location" }),
  ).toBeVisible();
}

for (const staleFailure of [false, true]) {
  test(`latest candidate wins over a delayed stale ${staleFailure ? "failure" : "success"}`, async ({
    page,
  }) => {
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
      override: (path, request) => {
        if (
          path !== contextPath ||
          locationId(request) !== LOCATION_A.locationId
        )
          return undefined;
        return staleFailure
          ? {
              status: 503,
              delayMs: 700,
              body: {
                code: "UNAVAILABLE",
                message: "stale",
                requestId: "stale-a",
              },
            }
          : { delayMs: 700, body: companyContext(LOCATION_A) };
      },
    });
    await enterCompany(page, fixture, "/help", "all");
    await openMenu(page);

    await page
      .getByRole("option", { name: LOCATION_A.name })
      .evaluate((element) => (element as HTMLElement).click());
    await page.getByRole("option", { name: LOCATION_B.name }).click();
    await expect(page.locator(".topbar .location-context")).toContainText(
      LOCATION_B.name,
    );
    await page.waitForTimeout(850);
    await expect(page.locator(".topbar .location-context")).toContainText(
      LOCATION_B.name,
    );
    await expect(
      page.getByRole("heading", { name: "Choose your authorized workspace" }),
    ).toHaveCount(0);
  });
}

test("a route change while candidate proof is pending invalidates the old intent", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path, request) =>
      path === contextPath && locationId(request) === LOCATION_B.locationId
        ? { delayMs: 700, body: companyContext(LOCATION_B) }
        : undefined,
  });
  await enterCompany(page, fixture, "/help", "a");
  await openMenu(page);
  await page
    .getByRole("option", { name: LOCATION_B.name })
    .evaluate((element) => (element as HTMLElement).click());
  await page.getByRole("link", { name: "Vehicles" }).click();
  await expect(page).toHaveURL(/\/vehicles$/u);
  await page.waitForTimeout(850);
  await expect(page.locator(".topbar .location-context")).toContainText(
    LOCATION_A.name,
  );
});

test("fresh lifecycle authority commits the new scope then falls back inside the mounted shell", async ({
  page,
}) => {
  const inactiveB = { ...LOCATION_B, status: "INACTIVE" as const };
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path, request) =>
      path === contextPath && locationId(request) === LOCATION_B.locationId
        ? { body: companyContext(inactiveB) }
        : undefined,
  });
  await enterCompany(page, fixture, "/maps-zones", "a");
  await page
    .locator(".shell")
    .evaluate((element) =>
      element.setAttribute("data-task02-shell", "mounted"),
    );
  await openMenu(page);
  await page.getByRole("option", { name: LOCATION_B.name }).click();

  await expect(page).toHaveURL(/\/employees$/u);
  await expect(page.locator(".topbar .location-context")).toContainText(
    LOCATION_B.name,
  );
  await expect(page.locator(".shell")).toBeVisible();
  await expect(page.locator(".sidebar").getByText(ORG_A.name)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Maps & Zones" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toHaveCount(0);
});

test("logout during delayed menu discovery cannot repopulate the old shell", async ({
  page,
}) => {
  let delayDiscovery = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path) =>
      path === locationsPath && delayDiscovery
        ? {
            delayMs: 700,
            body: { items: [LOCATION_A, LOCATION_B], nextCursor: null },
          }
        : undefined,
  });
  await enterCompany(page, fixture, "/help", "a");
  delayDiscovery = true;
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope" })
    .click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.waitForTimeout(850);
  await expect(page.getByTestId("location-switch-menu")).toHaveCount(0);
});

test("session replacement during candidate proof fences the pre-refresh intent", async ({
  page,
}) => {
  let candidateAttempts = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path, request) => {
      if (path !== contextPath || locationId(request) !== LOCATION_B.locationId)
        return undefined;
      candidateAttempts += 1;
      return candidateAttempts === 1
        ? {
            status: 401,
            body: {
              code: "STAFF_AUTHENTICATION_REQUIRED",
              message: "expired",
              requestId: "task02-refresh",
            },
          }
        : { body: companyContext(LOCATION_B) };
    },
  });
  await enterCompany(page, fixture, "/help", "a");
  const refreshesBefore = fixture.count("/v1/staff/auth/refresh");
  await openMenu(page);
  await page.getByRole("option", { name: LOCATION_B.name }).click();
  await expect
    .poll(() => fixture.count("/v1/staff/auth/refresh"))
    .toBe(refreshesBefore + 1);
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".topbar .location-context")).toContainText(
    LOCATION_A.name,
  );
  expect(candidateAttempts).toBe(2);
});

test("identity replacement during candidate proof cannot commit the old candidate", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path, request) =>
      path === contextPath && locationId(request) === LOCATION_B.locationId
        ? { delayMs: 800, body: companyContext(LOCATION_B) }
        : undefined,
  });
  await enterCompany(page, fixture, "/help", "a");
  await openMenu(page);
  await page
    .getByRole("option", { name: LOCATION_B.name })
    .evaluate((element) => (element as HTMLElement).click());
  await page.getByRole("button", { name: "Sign out" }).click();
  await signInOnCurrentPage(page, "replacement-admin@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await page.waitForTimeout(900);
  await expect(page.locator(".topbar .location-context")).toContainText(
    LOCATION_A.name,
  );
});

test("duplicate candidate activation issues one proof and one scope commit", async ({
  page,
}) => {
  let targetContextReads = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path, request) => {
      if (path !== contextPath || locationId(request) !== LOCATION_B.locationId)
        return undefined;
      targetContextReads += 1;
      return { delayMs: 500, body: companyContext(LOCATION_B) };
    },
  });
  await enterCompany(page, fixture, "/help", "a");
  await openMenu(page);
  const option = page.getByRole("option", { name: LOCATION_B.name });
  await option.evaluate((element: HTMLButtonElement) => {
    element.click();
    element.click();
  });
  await expect(page.locator(".topbar .location-context")).toContainText(
    LOCATION_B.name,
  );
  // Same exact budget as a single activation: one candidate proof plus the
  // post-commit shared authority revalidation, with no duplicate proof storm.
  expect(targetContextReads).toBe(2);
  await expect(page.getByTestId("location-switch-menu")).toHaveCount(0);
});

function locationId(request: Request): string | null {
  return new URL(request.url()).searchParams.get("locationId");
}

function companyContext(location: typeof LOCATION_A) {
  return {
    capabilities: ["LOCATION_DASHBOARD_READ"],
    organization: ORG_A,
    scope: { kind: "LOCATION" as const, locationId: location.locationId },
    selectedLocation: location,
  };
}
