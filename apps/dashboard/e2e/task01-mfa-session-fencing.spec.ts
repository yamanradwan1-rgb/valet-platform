import { expect, test } from "@playwright/test";

import { integrationsProjection } from "./support/administration-fixtures";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

const brandingPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/branding`;
const brandingWritePath = `${brandingPath}/default`;
const refreshPath = "/v1/staff/auth/refresh";
const stepUpPath = "/v1/staff/auth/mfa/step-up";
const integrationsPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/integrations`;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function branding() {
  return {
    organizationId: ORG_A.organizationId,
    updatedAt: "2026-09-21T10:00:00.000Z",
    displayName: "VAYLET",
    primaryColor: "#1E60F0",
  };
}

test("session refresh during MFA fences the old mutation intent without replay", async ({
  page,
}) => {
  const stepStarted = deferred();
  const releaseStep = deferred();
  let integrationReads = 0;
  let forceIntegration401 = false;
  let forcedIntegration401 = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    mfaState: "STEP_UP_REQUIRED",
    override: async (path, request) => {
      if (path === brandingPath && request.method() === "GET")
        return { body: branding() };
      if (path === brandingWritePath && request.method() === "PUT") {
        return {
          status: 403,
          body: {
            code: "MFA_STEP_UP_REQUIRED",
            message: "Verification required",
            requestId: "task01-session-mfa",
          },
        };
      }
      if (path === stepUpPath) {
        stepStarted.resolve();
        await releaseStep.promise;
        return { body: { state: "ASSURED" } };
      }
      if (path === integrationsPath) {
        integrationReads += 1;
        if (forceIntegration401 && !forcedIntegration401) {
          forcedIntegration401 = true;
          return {
            status: 401,
            body: {
              code: "STAFF_AUTHENTICATION_REQUIRED",
              message: "Authentication required.",
              requestId: "task01-session-refresh",
            },
          };
        }
        return { body: integrationsProjection() };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/branding");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();

  await page.getByLabel("Display name").fill("Old session intent");
  await page.getByRole("button", { name: "Save Display name" }).click();
  const dialog = page.getByRole("dialog", { name: "Verification required" });
  await dialog.getByLabel("6-digit authenticator code").fill("123456");
  await dialog.getByRole("button", { name: "Verify" }).click();
  await stepStarted.promise;
  await page
    .getByRole("link", { name: "Integrations" })
    .evaluate((element: HTMLAnchorElement) => element.click());

  await expect(
    page.getByRole("heading", { name: "Integrations & Connectors" }),
  ).toBeVisible();
  forceIntegration401 = true;
  const refreshesBefore = fixture.count(refreshPath);
  const readsBeforeRefresh = integrationReads;
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect.poll(() => fixture.count(refreshPath)).toBe(refreshesBefore + 1);
  await expect
    .poll(() => integrationReads)
    .toBeGreaterThanOrEqual(readsBeforeRefresh + 2);
  expect(integrationReads).toBeLessThanOrEqual(readsBeforeRefresh + 4);
  releaseStep.resolve();
  await expect.poll(() => fixture.count(stepUpPath)).toBe(1);
  await expect(dialog).toHaveCount(0);
  expect(fixture.count(brandingWritePath)).toBe(1);
  await page.waitForLoadState("networkidle");
  expect(fixture.count(brandingWritePath)).toBe(1);
  await expect(page.getByText("submit the action again")).toHaveCount(0);
  const settledIntegrationReads = integrationReads;
  await page.waitForTimeout(300);
  expect(integrationReads).toBe(settledIntegrationReads);
});
