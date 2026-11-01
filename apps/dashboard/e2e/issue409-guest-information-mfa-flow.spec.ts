import { expect, test, type Page } from "@playwright/test";
import { LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

import {
  enterIssue409GuestPage,
  guestPaths,
  issue409GuestMfaFixture,
  previewMarker,
  showGuestPreview,
} from "./support/issue409-guest-information-mfa-fixture";

const stepUpPath = "/v1/staff/auth/mfa/step-up";
const confirmPath = "/v1/staff/auth/mfa/enrollment/confirm";
const beginPath = "/v1/staff/auth/mfa/enrollment/begin";

async function verifyAuthenticator(page: Page) {
  await page.getByLabel("6-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Verify", exact: true }).click();
}

async function confirmAuthenticator(page: Page) {
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  await expect(
    page.getByRole("heading", { name: "Authenticator setup" }),
  ).toBeVisible();
  await page.getByLabel("6-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Confirm authenticator" }).click();
}

test("#409 unassured LM selects a valid workspace, then step-up unlocks the same guest page", async ({
  page,
}) => {
  const { fixture, state } = issue409GuestMfaFixture("STEP_UP_REQUIRED");
  await enterIssue409GuestPage(page, fixture);
  const privacyPath = guestPaths().privacy;
  await expect.poll(() => fixture.count(privacyPath)).toBeGreaterThan(0);
  await expect(page.getByText(previewMarker(), { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("6-digit authenticator code")).toBeVisible();
  const before = fixture.count(privacyPath);

  await verifyAuthenticator(page);
  await expect.poll(() => fixture.count(privacyPath)).toBe(before + 1);
  await expect(page).toHaveURL(/\/guest-information$/u);
  await expect(
    page.getByRole("heading", { name: "Privacy & Contact" }),
  ).toBeVisible();
  await showGuestPreview(page);
  await expect(page.locator('[data-widget="preview"]')).toContainText(
    previewMarker(),
  );
  expect(fixture.count(stepUpPath)).toBe(1);
  expect(state.writes).toBe(0);
  expect(state.readPaths).toContain(privacyPath);
});

test("#409 enrollment waits for recovery-code acknowledgment before retrying the protected read", async ({
  page,
}) => {
  const { fixture } = issue409GuestMfaFixture("ENROLLMENT_REQUIRED");
  await enterIssue409GuestPage(page, fixture);
  const path = guestPaths().privacy;
  await expect.poll(() => fixture.count(path)).toBeGreaterThan(0);
  const before = fixture.count(path);

  await confirmAuthenticator(page);
  await expect(
    page.getByRole("heading", { name: "Recovery codes" }),
  ).toBeVisible();
  await expect(page.locator("ol li")).toHaveCount(10);
  expect(fixture.count(beginPath)).toBe(1);
  expect(fixture.count(confirmPath)).toBe(1);
  expect(fixture.count(path)).toBe(before);
  await expect(page.getByText(previewMarker(), { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "I saved these codes" }).click();
  await expect.poll(() => fixture.count(path)).toBe(before + 1);
  await expect(page).toHaveURL(/\/guest-information$/u);
  await showGuestPreview(page);
  await expect(page.locator('[data-widget="preview"]')).toContainText(
    previewMarker(),
  );
});

test("#409 pending enrollment resumes the existing ceremony and restores guest reads", async ({
  page,
}) => {
  const { fixture } = issue409GuestMfaFixture("ENROLLMENT_PENDING");
  await enterIssue409GuestPage(page, fixture);
  await expect(
    page.getByRole("button", {
      name: "Continue authenticator setup",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continue authenticator setup" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Authenticator setup" }),
  ).toBeVisible();
  await page.getByLabel("6-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Confirm authenticator" }).click();
  await expect(page.locator("ol li")).toHaveCount(10);
  await page.getByRole("button", { name: "I saved these codes" }).click();
  await showGuestPreview(page);
  await expect(page.locator('[data-widget="preview"]')).toContainText(
    previewMarker(),
  );
  expect(fixture.count(beginPath)).toBe(1);
  expect(fixture.count(confirmPath)).toBe(1);
});

test("#409 invalid TOTP keeps the challenge and never exposes protected guest data", async ({
  page,
}) => {
  const { fixture } = issue409GuestMfaFixture("STEP_UP_REQUIRED");
  await fixture.install(page);
  let attempts = 0;
  await page.route("**" + stepUpPath, async (route) => {
    attempts++;
    if (attempts > 1) return route.fallback();
    return route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        code: "MFA_CODE_INVALID",
        message: "Invalid code",
        requestId: "issue409-invalid-totp",
      }),
    });
  });
  await page.goto("/help");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", { name: LOCATION_A.name, exact: true })
    .click();
  await page.goto("/guest-information");
  const path = guestPaths().privacy;
  await expect.poll(() => fixture.count(path)).toBeGreaterThan(0);
  const before = fixture.count(path);

  await verifyAuthenticator(page);
  await expect(page.getByLabel("6-digit authenticator code")).toBeVisible();
  expect(fixture.count(path)).toBe(before);
  await expect(page.getByText(previewMarker(), { exact: true })).toHaveCount(0);
  await verifyAuthenticator(page);
  await expect.poll(() => fixture.count(path)).toBe(before + 1);
  expect(attempts).toBe(2);
});

test("#409 repeated MFA 403 after verification is bounded and never becomes a false success", async ({
  page,
}) => {
  const { fixture, state } = issue409GuestMfaFixture("STEP_UP_REQUIRED");
  state.denyAfterAssurance = true;
  await enterIssue409GuestPage(page, fixture);
  const path = guestPaths().privacy;
  await expect.poll(() => fixture.count(path)).toBeGreaterThan(0);
  const before = fixture.count(path);
  await verifyAuthenticator(page);
  await expect.poll(() => fixture.count(path)).toBe(before + 1);
  await page.waitForTimeout(400);
  expect(fixture.count(path)).toBe(before + 1);
  expect(fixture.count(stepUpPath)).toBe(1);
  await expect(page.getByText(previewMarker(), { exact: true })).toHaveCount(0);
});

for (const failure of ["DENIED", "UNAVAILABLE", "MALFORMED"] as const) {
  test(
    "#409 " + failure + " GET failure stays an error without an MFA ceremony",
    async ({ page }) => {
      const { fixture, state } = issue409GuestMfaFixture("ASSURED");
      state.readFailure = failure;
      await enterIssue409GuestPage(page, fixture);
      await expect(
        page.getByRole("button", { name: "Retry" }).first(),
      ).toBeVisible();
      await expect(page.getByLabel("6-digit authenticator code")).toHaveCount(
        0,
      );
      await expect(
        page.getByRole("button", { name: "Set up authenticator" }),
      ).toHaveCount(0);
      expect(fixture.count(stepUpPath)).toBe(0);
    },
  );
}

test("#409 network failure remains retryable and does not trigger MFA", async ({
  page,
}) => {
  const { fixture } = issue409GuestMfaFixture("ASSURED");
  await fixture.install(page);
  await page.route("**" + guestPaths().privacy, (route) =>
    route.abort("failed"),
  );
  await page.goto("/help");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", { name: LOCATION_A.name, exact: true })
    .click();
  await page.goto("/guest-information");
  await expect(
    page.getByRole("button", { name: "Retry" }).first(),
  ).toBeVisible();
  await expect(page.getByLabel("6-digit authenticator code")).toHaveCount(0);
  expect(fixture.count(stepUpPath)).toBe(0);
});
