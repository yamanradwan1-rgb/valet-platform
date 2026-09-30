import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

const brandingPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/branding`;
const brandingWritePath = `${brandingPath}/default`;

function branding(
  displayName = "VAYLET",
  updatedAt = "2026-09-21T10:00:00.000Z",
) {
  return {
    organizationId: ORG_A.organizationId,
    updatedAt,
    displayName,
    primaryColor: "#1E60F0",
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function openCompanyAllLocations(page: Page) {
  await page.goto("/branding");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
}

async function changeCompanyScope(page: Page, scopeName: string) {
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope" })
    .click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: scopeName }).click();
}

for (const mode of ["success", "failure", "mfa", "conflict"] as const) {
  test(`A→B→A suppresses stale Branding mutation ${mode} callbacks`, async ({
    page,
  }) => {
    const started = deferred();
    const release = deferred();
    let returned = false;
    let currentBranding = branding();
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: async (path, request) => {
        if (path === brandingPath && request.method() === "GET")
          return { body: currentBranding };
        if (path !== brandingWritePath || request.method() !== "PUT")
          return undefined;
        started.resolve();
        await release.promise;
        returned = true;
        if (mode === "success") {
          currentBranding = branding(
            "Committed old epoch",
            "2026-09-21T10:02:00.000Z",
          );
          return { body: currentBranding };
        }
        if (mode === "mfa") {
          return {
            status: 403,
            body: {
              code: "MFA_STEP_UP_REQUIRED",
              message: "Stale MFA challenge",
              requestId: "task01-stale-mfa",
            },
          };
        }
        if (mode === "conflict")
          return {
            status: 409,
            body: {
              code: "CONFLICT",
              message: "Stale conflict",
              requestId: "task01-stale-conflict",
            },
          };
        return {
          status: 503,
          body: {
            code: "TEMPORARY",
            message: "Stale mutation failure",
            requestId: "task01-stale-failure",
          },
        };
      },
    });
    await fixture.install(page);
    await openCompanyAllLocations(page);

    await page.getByLabel("Display name").fill("Old epoch brand");
    await page.getByRole("button", { name: "Save Display name" }).click();
    await started.promise;

    await changeCompanyScope(page, LOCATION_A.name);
    await expect(page.getByLabel("Display name")).toHaveValue("VAYLET");
    await changeCompanyScope(page, "All Locations");
    await expect(page.getByLabel("Display name")).toHaveValue("VAYLET");
    const readsBeforeRelease = fixture.count(brandingPath);

    release.resolve();
    await expect.poll(() => returned).toBe(true);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );

    expect(fixture.count(brandingWritePath)).toBe(1);
    expect(fixture.count(brandingPath)).toBe(readsBeforeRelease);
    await expect(page.getByText("Stale mutation failure")).toHaveCount(0);
    await expect(page.getByText("Stale conflict")).toHaveCount(0);
    await expect(page.getByText("Stale MFA challenge")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Verification required" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Display name")).toHaveValue("VAYLET");
  });
}

test("scope change invalidates an in-flight Branding MFA intent", async ({
  page,
}) => {
  const stepStarted = deferred();
  const releaseStep = deferred();
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
            requestId: "task01-mfa",
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
  await openCompanyAllLocations(page);

  await page.getByLabel("Display name").fill("Old MFA intent");
  await page.getByRole("button", { name: "Save Display name" }).click();
  const dialog = page.getByRole("dialog", { name: "Verification required" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("6-digit authenticator code").fill("123456");
  await dialog.getByRole("button", { name: "Verify" }).click();
  await stepStarted.promise;

  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope" })
    .evaluate((element: HTMLButtonElement) => element.click());
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toBeVisible();

  releaseStep.resolve();
  await page.waitForLoadState("networkidle");

  expect(fixture.count(brandingWritePath)).toBe(1);
  expect(fixture.count("/v1/staff/auth/mfa/step-up")).toBe(1);
  await expect(
    page.getByText(
      "Verification succeeded. Review the values and submit the action again.",
    ),
  ).toHaveCount(0);
});

test("identity replacement fences an in-flight Branding MFA completion", async ({
  page,
}) => {
  const stepStarted = deferred();
  const releaseStep = deferred();
  let stepReturned = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
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
            requestId: "task01-replacement-mfa",
          },
        };
      }
      if (path === "/v1/staff/auth/mfa/step-up") {
        stepStarted.resolve();
        await releaseStep.promise;
        stepReturned = true;
        return { body: { state: "ASSURED" } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await openCompanyAllLocations(page);

  await page.getByLabel("Display name").fill("Old MFA intent");
  await page.getByRole("button", { name: "Save Display name" }).click();
  const dialog = page.getByRole("dialog", { name: "Verification required" });
  await dialog.getByLabel("6-digit authenticator code").fill("123456");
  await dialog.getByRole("button", { name: "Verify" }).click();
  await stepStarted.promise;

  await page
    .getByRole("button", { name: "Sign out" })
    .evaluate((element: HTMLButtonElement) => element.click());
  await signInOnCurrentPage(page, "replacement-admin@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(page.getByLabel("Display name")).toHaveValue("VAYLET");

  releaseStep.resolve();
  await expect.poll(() => stepReturned).toBe(true);
  expect(fixture.count(brandingWritePath)).toBe(1);
  expect(fixture.count("/v1/staff/auth/mfa/step-up")).toBe(1);
  await expect(page.getByText("submit the action again")).toHaveCount(0);
  await expect(page.getByLabel("Display name")).toHaveValue("VAYLET");
});

test("logout fences a delayed Branding mutation callback", async ({ page }) => {
  const started = deferred();
  const release = deferred();
  let returned = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: async (path, request) => {
      if (path === brandingPath && request.method() === "GET")
        return { body: branding() };
      if (path !== brandingWritePath || request.method() !== "PUT")
        return undefined;
      started.resolve();
      await release.promise;
      returned = true;
      return {
        body: branding("Committed after logout", "2026-09-21T10:03:00.000Z"),
      };
    },
  });
  await fixture.install(page);
  await openCompanyAllLocations(page);

  await page.getByLabel("Display name").fill("Pending logout mutation");
  await page.getByRole("button", { name: "Save Display name" }).click();
  await started.promise;
  const readsBeforeLogout = fixture.count(brandingPath);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  release.resolve();
  await expect.poll(() => returned).toBe(true);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

  expect(fixture.count(brandingWritePath)).toBe(1);
  expect(fixture.count(brandingPath)).toBe(readsBeforeLogout);
  await expect(page.getByText("Committed after logout")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
