import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  openLocationManagerWorkspace,
} from "./support/foundation-ui";

const statePath = "/v1/staff/auth/mfa/state";

function isBusinessPath(path: string): boolean {
  return (
    path.startsWith("/v1/staff/management/") ||
    path.startsWith("/v1/staff/dashboard/") ||
    path === "/v1/staff/operational-context"
  );
}

function businessCounts(fixture: DashboardApiFixture) {
  return [...fixture.counts.entries()]
    .filter(([path, count]) => count > 0 && isBusinessPath(path))
    .sort(([left], [right]) => left.localeCompare(right));
}

async function signInOnSecurity(page: Page) {
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("direct Security uses the Dashboard shell with null business scope and no discovery", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({ mfaState: "ASSURED" });
  await fixture.install(page);
  await page.goto("/security");
  await signInOnSecurity(page);

  await expect(page.locator(".shell")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Security", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Language" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Theme" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.locator(".sidebar-scope")).toHaveCount(0);
  await expect(page.locator(".location-context")).toHaveCount(0);
  await expect(page.locator(".sidebar").getByText(ORG_A.name)).toHaveCount(0);
  await expect(page.locator(".topbar").getByText(LOCATION_A.name)).toHaveCount(0);
  await expect(page.getByText("All Locations", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Security" }),
  ).toHaveAttribute("aria-current", "page");
  expect(fixture.count(statePath)).toBe(1);
  expect(businessCounts(fixture)).toEqual([]);
});

test("Security preserves a resolved Location workspace only as shell presentation", async ({
  page,
}) => {
  const mfaRequests: Array<{ body: string | null; url: string }> = [];
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    mfaState: "ASSURED",
    override: (path, request) => {
      if (path.startsWith("/v1/staff/auth/mfa/")) {
        mfaRequests.push({ body: request.postData(), url: request.url() });
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await openLocationManagerWorkspace(page);
  const businessBefore = businessCounts(fixture);
  const stateReadsBefore = fixture.count(statePath);

  await page.getByRole("link", { name: "Security" }).click();
  await expect(page).toHaveURL(/\/security$/u);
  await expect(page.locator(".sidebar").getByText(ORG_A.name)).toBeVisible();
  await expect(page.locator(".topbar").getByText(LOCATION_A.name)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Security" }),
  ).toHaveAttribute("aria-current", "page");
  expect(businessCounts(fixture)).toEqual(businessBefore);
  expect(fixture.count(statePath)).toBe(stateReadsBefore + 1);
  expect(mfaRequests.length).toBeGreaterThan(0);
  for (const request of mfaRequests) {
    const url = new URL(request.url);
    expect(url.search).toBe("");
    expect(url.pathname).not.toContain(ORG_A.organizationId);
    expect(url.pathname).not.toContain(LOCATION_A.locationId);
    expect(request.body).toBeNull();
  }
});

test("confirmed LM-only account hides Security navigation and direct route is unavailable", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) =>
      path === statePath
        ? {
            status: 409,
            body: {
              code: "MFA_ENROLLMENT_NOT_AVAILABLE",
              message: "MFA enrollment is not available.",
              requestId: "issue234-ineligible",
            },
          }
        : undefined,
  });
  await fixture.install(page);
  await openLocationManagerWorkspace(page);
  await expect(page.getByRole("link", { name: "Security" })).toHaveCount(0);

  await page.goto("/security");
  await expect(page.locator(".shell")).toBeVisible();
  await expect(page.getByText("Account security is not available for this Staff session.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Set up authenticator" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Verify" })).toHaveCount(0);
});

test("5xx enrollment-not-available code remains retryable unknown", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    override: (path) =>
      path === statePath
        ? {
            status: 503,
            body: {
              code: "MFA_ENROLLMENT_NOT_AVAILABLE",
              message: "temporary failure",
              requestId: "issue234-nonauthoritative-denial",
            },
          }
        : undefined,
  });
  await fixture.install(page);
  await page.goto("/security");
  await signInOnSecurity(page);

  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(
    page.getByText("Account security is not available for this Staff session."),
  ).toHaveCount(0);
});

test("cold Security state 401 performs one auth reconciliation and one GET replay", async ({
  page,
}) => {
  let stateAttempts = 0;
  const fixture = new DashboardApiFixture({
    mfaState: "ASSURED",
    override: (path) => {
      if (path !== statePath) return undefined;
      stateAttempts += 1;
      if (stateAttempts === 1) {
        return {
          status: 401,
          body: {
            code: "STAFF_AUTHENTICATION_FAILED",
            message: "expired",
            requestId: "issue234-state-401",
          },
        };
      }
      return { body: { state: "ASSURED" } };
    },
  });
  await fixture.install(page);
  await page.goto("/security");
  await signInOnSecurity(page);
  await expect(page.getByRole("status")).toContainText("Verified");
  expect(fixture.count(statePath)).toBe(2);
  // One cold no-cookie bootstrap refresh plus one reconciliation for the state 401.
  expect(fixture.count("/v1/staff/auth/refresh")).toBe(2);
  expect(businessCounts(fixture)).toEqual([]);
});
