import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { openLocationManagerWorkspace, signIn } from "./support/foundation-ui";

test("cookie refresh restores the selected Location on the same route after reload", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
  await fixture.install(page);

  await signIn(page, "manager@example.com");
  expect(fixture.loginBodies).toEqual([
    { email: "manager@example.com", password: "fixture-password" },
  ]);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page).toHaveURL(/\/overview$/u);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.locator(".topbar").getByText(LOCATION_A.name)).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/overview$/u);
  await expect(page.locator(".topbar").getByText(LOCATION_A.name)).toBeVisible();
  await expect(page.locator(".sidebar").getByText(ORG_A.name)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Sign in" })).toHaveCount(0);
  expect(fixture.refreshCookieSeen).toBe(true);
});

test("logout clears the protected session and browser back stays at login", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
  await fixture.install(page);
  await openLocationManagerWorkspace(page);

  await page.getByRole("link", { name: "Help" }).click();
  await expect(
    page.getByRole("heading", { name: "Help and product guidance" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/overview$/u);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Overview" })).toHaveCount(0);
});

test("failed logout stays fail-closed across reload until server logout is confirmed", async ({
  page,
}) => {
  let logoutAttempts = 0;
  const fixture = new DashboardApiFixture({
    override: (path) => {
      if (path !== "/v1/staff/auth/logout") return undefined;
      logoutAttempts += 1;
      return logoutAttempts === 1
        ? {
            status: 503,
            body: { code: "UNAVAILABLE", message: "offline", requestId: "e2e-logout" },
          }
        : undefined;
    },
  });
  await fixture.install(page);
  await signIn(page);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText(/Sign-out could not be confirmed/u)).toBeVisible();
  const refreshCount = fixture.count("/v1/staff/auth/refresh");

  await page.reload();
  await expect(page.getByText(/Sign-out could not be confirmed/u)).toBeVisible();
  expect(fixture.count("/v1/staff/auth/refresh")).toBe(refreshCount);
  await expect(page.getByRole("heading", { name: "Sign in" })).toHaveCount(0);

  await page.getByRole("button", { name: "Retry sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(logoutAttempts).toBe(2);
});

test("a protected GET 401 performs one refresh and one replay", async ({
  page,
}) => {
  const managementPath = "/v1/staff/management/organizations";
  const authorizations: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path, request, state) => {
      if (path === managementPath) {
        authorizations.push(request.headers().authorization ?? "");
      }
      if (path === managementPath && state.count(path) === 1) {
        return {
          status: 401,
          body: {
            code: "STAFF_AUTHENTICATION_REQUIRED",
            message: "expired",
            requestId: "e2e-expired",
          },
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);

  await signIn(page);
  await expect(page.getByRole("button", { name: ORG_A.name })).toBeVisible();
  await expect.poll(() => fixture.count(managementPath)).toBe(3);
  expect(fixture.count("/v1/staff/auth/refresh")).toBe(2);
  expect(authorizations).toHaveLength(3);
  expect(authorizations[0]).not.toBe(authorizations[1]);
  expect(authorizations[1]).toBe(authorizations[2]);
});
