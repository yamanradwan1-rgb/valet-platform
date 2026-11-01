import { expect, test } from "@playwright/test";

import {
  completeIssue409StepUp as completeStepUp,
  denyNextPreviewWithMfa,
  enterIssue409GuestPage,
  guestPaths,
  issue409GuestMfaFixture,
} from "./support/issue409-guest-information-mfa-fixture";

test("#409 same logical session refresh during MFA continuation retains the unsaved Contact draft", async ({
  page,
}) => {
  const { fixture, state } = issue409GuestMfaFixture("ASSURED");
  await enterIssue409GuestPage(page, fixture);
  await page.locator('[data-view-target="contact"]').click();
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  await page.getByRole("button", { name: "Set a location value" }).click();
  const phone = page.locator("#guest-information-override-phone");
  await phone.fill("0795432199");
  await expect(page.getByText("Unsaved edits", { exact: true })).toBeVisible();
  const challenged = await denyNextPreviewWithMfa(page);
  fixture.mfaState = "STEP_UP_REQUIRED";
  fixture.mfaAssured = false;
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await expect(page.locator("#mfa-totp-mfaVerify")).toBeVisible();
  expect(challenged()).toBe(true);

  let expiredOnce = false;
  const refreshesBefore = fixture.count("/v1/staff/auth/refresh");
  await page.route("**" + guestPaths().privacy, async (route) => {
    if (expiredOnce) return route.fallback();
    expiredOnce = true;
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        code: "STAFF_AUTHENTICATION_REQUIRED",
        message: "Session refresh required",
        requestId: "issue409-same-session-refresh",
      }),
    });
  });
  await completeStepUp(page);
  await expect
    .poll(() => fixture.count("/v1/staff/auth/refresh"))
    .toBeGreaterThan(refreshesBefore);
  expect(expiredOnce).toBe(true);
  await page.locator('[data-view-target="contact"]').click();
  if (!(await phone.isVisible())) {
    await page.getByRole("button", { name: "Customize", exact: true }).click();
    const setValue = page.getByRole("button", {
      name: "Set a location value",
    });
    if (await setValue.isVisible()) await setValue.click();
  }
  await expect(phone).toHaveValue("0795432199");
  await expect(page.getByText("Unsaved edits", { exact: true })).toBeVisible();
  expect(state.writes).toBe(0);
});

test("#409 a same-session 401 refresh before an MFA 403 does not erase the Contact draft", async ({
  page,
}) => {
  const { fixture, state } = issue409GuestMfaFixture("ASSURED");
  await enterIssue409GuestPage(page, fixture);
  await page.locator('[data-view-target="contact"]').click();
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  await page.getByRole("button", { name: "Set a location value" }).click();
  const phone = page.locator("#guest-information-override-phone");
  await phone.fill("0795432199");
  await expect(page.getByText("Unsaved edits", { exact: true })).toBeVisible();
  fixture.mfaState = "STEP_UP_REQUIRED";
  fixture.mfaAssured = false;
  let previewAttempts = 0;
  let releaseMfaReply!: () => void;
  const replyGate = new Promise<void>((resolve) => {
    releaseMfaReply = resolve;
  });
  const refreshesBefore = fixture.count("/v1/staff/auth/refresh");
  await page.route("**" + guestPaths().preview + "*", async (route) => {
    previewAttempts++;
    if (previewAttempts === 1) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          code: "STAFF_AUTHENTICATION_REQUIRED",
          message: "Session refresh required",
          requestId: "issue409-pre-challenge-refresh",
        }),
      });
    } else if (previewAttempts === 2) {
      await replyGate;
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          code: "MFA_STEP_UP_REQUIRED",
          message: "MFA step-up required",
          requestId: "issue409-post-refresh-challenge",
        }),
      });
    } else {
      await route.fallback();
    }
  });
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await expect
    .poll(() => fixture.count("/v1/staff/auth/refresh"))
    .toBeGreaterThan(refreshesBefore);
  // React must begin replacing the refresh-fenced shell before the MFA 403.
  try {
    await expect(phone).toHaveCount(0);
  } finally {
    releaseMfaReply();
  }
  await expect(page.locator("#mfa-totp-mfaVerify")).toBeVisible();
  expect(previewAttempts).toBeGreaterThanOrEqual(2);
  await completeStepUp(page);
  await page.locator('[data-view-target="contact"]').click();
  if (!(await phone.isVisible())) {
    await page.getByRole("button", { name: "Customize", exact: true }).click();
    const setValue = page.getByRole("button", {
      name: "Set a location value",
    });
    if (await setValue.isVisible()) await setValue.click();
  }
  await expect(phone).toHaveValue("0795432199");
  await expect(page.getByText("Unsaved edits", { exact: true })).toBeVisible();
  expect(state.writes).toBe(0);
});

test("#409 a completed same-session token refresh before later MFA preserves the Contact draft", async ({
  page,
}) => {
  const { fixture, state } = issue409GuestMfaFixture("ASSURED");
  await enterIssue409GuestPage(page, fixture);
  await page.locator('[data-view-target="contact"]').click();
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  await page.getByRole("button", { name: "Set a location value" }).click();
  const phone = page.locator("#guest-information-override-phone");
  await phone.fill("0795432199");
  await expect(page.getByText("Unsaved edits", { exact: true })).toBeVisible();
  const refreshesBefore = fixture.count("/v1/staff/auth/refresh");
  let refreshed = false;
  await page.route("**" + guestPaths().preview + "*", async (route) => {
    if (refreshed) return route.fallback();
    refreshed = true;
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        code: "STAFF_AUTHENTICATION_REQUIRED",
        message: "Session refresh required",
        requestId: "issue409-before-challenge-refresh",
      }),
    });
  });
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await expect
    .poll(() => fixture.count("/v1/staff/auth/refresh"))
    .toBeGreaterThan(refreshesBefore);
  await expect(
    page.getByRole("heading", { name: "الخصوصية والتواصل" }),
  ).toBeVisible();
  await page.locator('[data-view-target="contact"]').click();
  if (!(await phone.isVisible())) {
    await page.getByRole("button", { name: "تخصيص", exact: true }).click();
    const setValue = page.getByRole("button", {
      name: "تحديد قيمة للموقع",
    });
    if (await setValue.isVisible()) await setValue.click();
  }
  await expect(phone).toHaveCount(1);
  expect(refreshed).toBe(true);

  const challenged = await denyNextPreviewWithMfa(page);
  fixture.mfaState = "STEP_UP_REQUIRED";
  fixture.mfaAssured = false;
  await page.getByRole("button", { name: "اللغة", exact: true }).click();
  const code = page.locator("#mfa-totp-mfaVerify");
  await expect(code).toBeVisible();
  expect(challenged()).toBe(true);
  await code.fill("123456");
  await page
    .locator("form:has(#mfa-totp-mfaVerify) button[type=submit]")
    .click();
  await expect(code).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Privacy & Contact" }),
  ).toBeVisible();
  await page.locator('[data-view-target="contact"]').click();
  if (!(await phone.isVisible())) {
    await page.getByRole("button", { name: "Customize", exact: true }).click();
    const setValue = page.getByRole("button", {
      name: "Set a location value",
    });
    if (await setValue.isVisible()) await setValue.click();
  }
  await expect(phone).toHaveValue("0795432199");
  await expect(page.getByText("Unsaved edits", { exact: true })).toBeVisible();
  expect(state.writes).toBe(0);
});
