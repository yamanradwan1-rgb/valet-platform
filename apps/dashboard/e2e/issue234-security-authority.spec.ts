import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
  supervisorContext,
} from "./support/dashboard-api-fixture";
import { openLocationManagerWorkspace, signIn } from "./support/foundation-ui";

const statePath = "/v1/staff/auth/mfa/state";
const ceremonyPaths = [
  "/v1/staff/auth/mfa/enrollment/begin",
  "/v1/staff/auth/mfa/enrollment/confirm",
  "/v1/staff/auth/mfa/step-up",
  "/v1/staff/auth/mfa/recovery/begin",
  "/v1/staff/auth/mfa/recovery-codes/reissue",
] as const;

function ineligibleReply() {
  return {
    status: 409,
    body: {
      code: "MFA_ENROLLMENT_NOT_AVAILABLE",
      message: "MFA enrollment is not available.",
      requestId: "issue234-authority-denied",
    },
  } as const;
}

async function signInOnSecurity(page: Page, email = "manager@example.com") {
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("confirmed ineligible direct Security is unavailable without a ceremony", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    override: (path) => (path === statePath ? ineligibleReply() : undefined),
  });
  await fixture.install(page);
  await page.goto("/security");
  await signInOnSecurity(page);

  await expect(page.locator(".shell")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Security", level: 1 })).toBeVisible();
  await expect(
    page.getByText("Account security is not available for this Staff session."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Security" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Set up authenticator" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Verify" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Replace recovery codes" })).toHaveCount(0);
  expect(fixture.count(statePath)).toBe(1);
  for (const path of ceremonyPaths) expect(fixture.count(path)).toBe(0);
});

test("LM-only workspace hides Security after account authority denial", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => (path === statePath ? ineligibleReply() : undefined),
  });
  await fixture.install(page);
  await openLocationManagerWorkspace(page);

  await expect(page.locator(".sidebar").getByText(ORG_A.name)).toBeVisible();
  await expect(page.locator(".topbar").getByText(LOCATION_A.name)).toBeVisible();
  await expect(page.getByRole("link", { name: "Security" })).toHaveCount(0);
  await page.getByRole("link", { name: "Help" }).click();
  await expect(page.getByRole("link", { name: "Open account security" })).toHaveCount(0);

  await page.goto("/security");
  await expect(
    page.getByText("Account security is not available for this Staff session."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Security" })).toHaveCount(0);
  for (const path of ceremonyPaths) expect(fixture.count(path)).toBe(0);
});

test("mixed eligible account keeps Security while the selected workspace is LM", async ({
  page,
}) => {
  let accountEligibilityReads = 0;
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path !== statePath) return undefined;
      accountEligibilityReads += 1;
      return { body: { state: "ASSURED" } };
    },
  });
  await fixture.install(page);
  await openLocationManagerWorkspace(page);

  const navigation = page.getByRole("navigation", { name: "Management navigation" });
  const security = navigation.getByRole("link", { name: "Security" });
  await expect(security).toBeVisible();
  const navigationBefore = await navigation.getByRole("link").allTextContents();

  await security.click();
  await expect(page).toHaveURL(/\/security$/u);
  await expect(page.locator(".sidebar").getByText(ORG_A.name)).toBeVisible();
  await expect(page.locator(".topbar").getByText(LOCATION_A.name)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Security" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("navigation", { name: "Management navigation" }).getByRole("link"),
  ).toHaveText(navigationBefore);
  expect(accountEligibilityReads).toBeGreaterThan(0);
});

test("mixed eligible account keeps Security while the selected workspace is Supervisor", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    operationalContexts: [supervisorContext()],
    override: (path) =>
      path === statePath ? { body: { state: "ASSURED" } } : undefined,
  });
  await fixture.install(page);
  await signIn(page, "supervisor@example.com");
  await page
    .getByRole("button", { name: `${ORG_A.name} · ${LOCATION_A.name}` })
    .click();
  await expect(page).toHaveURL(/\/maps-zones$/u);

  const security = page
    .getByRole("navigation", { name: "Management navigation" })
    .getByRole("link", { name: "Security" });
  await expect(security).toBeVisible();
  await security.click();

  await expect(page.locator(".sidebar").getByText(ORG_A.name)).toBeVisible();
  await expect(page.locator(".topbar").getByText(LOCATION_A.name)).toBeVisible();
  await expect(page.getByRole("link", { name: "Security" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
