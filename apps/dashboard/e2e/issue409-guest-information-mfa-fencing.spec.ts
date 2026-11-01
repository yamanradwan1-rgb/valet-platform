import { expect, test } from "@playwright/test";

import { LOCATION_A, LOCATION_B, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  enterIssue409GuestPage,
  guestPaths,
  issue409GuestMfaFixture,
  previewMarker,
  showGuestPreview,
} from "./support/issue409-guest-information-mfa-fixture";

function deferred() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

test("#409 stale Location A guest data cannot replace Location B after a scope switch", async ({
  page,
}) => {
  const { fixture, state } = issue409GuestMfaFixture("ASSURED");
  const delayed = deferred();
  const oldPath = guestPaths(LOCATION_A.locationId).preview;
  const newPath = guestPaths(LOCATION_B.locationId).preview;
  state.readBarrier = { path: oldPath, wait: delayed.wait };
  try {
    await enterIssue409GuestPage(page, fixture);
    await expect.poll(() => fixture.count(oldPath)).toBeGreaterThan(0);
    await page
      .getByRole("button", { name: "Change scope", exact: true })
      .click();
    await page.getByRole("option", { name: LOCATION_B.name }).click();
    await expect(page.locator(".location-context-value")).toHaveText(
      LOCATION_B.name,
    );
    await expect.poll(() => fixture.count(newPath)).toBeGreaterThan(0);
    await showGuestPreview(page);
    await expect(page.locator('[data-widget="preview"]')).toContainText(
      previewMarker(LOCATION_B.locationId),
    );
  } finally {
    delayed.release();
  }
  await page.waitForTimeout(200);
  await expect(page.locator('[data-widget="preview"]')).not.toContainText(
    previewMarker(LOCATION_A.locationId),
  );
  expect(fixture.count(newPath)).toBeGreaterThan(0);
});

test("#409 leaving Guest Information while a 403 read is pending cannot gate Overview", async ({
  page,
}) => {
  const { fixture, state } = issue409GuestMfaFixture("STEP_UP_REQUIRED");
  const delayed = deferred();
  const path = guestPaths().privacy;
  state.readBarrier = { path, wait: delayed.wait };
  try {
    await enterIssue409GuestPage(page, fixture);
    await expect.poll(() => fixture.count(path)).toBeGreaterThan(0);
    await page.goto("/overview");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByLabel("6-digit authenticator code")).toHaveCount(0);
  } finally {
    delayed.release();
  }
  await page.waitForTimeout(200);
  await expect(page).toHaveURL(/\/overview$/u);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByLabel("6-digit authenticator code")).toHaveCount(0);
});

test("#409 logout invalidates pending Guest Information reads", async ({
  page,
}) => {
  const { fixture, state } = issue409GuestMfaFixture("ASSURED");
  const delayed = deferred();
  const path = guestPaths().privacy;
  state.readBarrier = { path, wait: delayed.wait };
  try {
    await enterIssue409GuestPage(page, fixture);
    await expect.poll(() => fixture.count(path)).toBeGreaterThan(0);
    await page.goto("/help");
    await expect(
      page.getByRole("heading", {
        name: "Help and product guidance",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  } finally {
    delayed.release();
  }
  await page.waitForTimeout(200);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText(previewMarker(), { exact: true })).toHaveCount(0);
});

test("#409 an old MFA verification response cannot assure a replacement session", async ({
  page,
}) => {
  const { fixture } = issue409GuestMfaFixture("STEP_UP_REQUIRED");
  await fixture.install(page);
  const pending = deferred();
  let stepUps = 0;
  await page.route("**/v1/staff/auth/mfa/step-up", async (route) => {
    stepUps++;
    if (stepUps !== 1) return route.fallback();
    await pending.wait;
    await route
      .fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ state: "ASSURED" }),
      })
      .catch(() => undefined);
  });

  try {
    await page.goto("/help");
    await signInOnCurrentPage(page, "manager@example.com");
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page
      .getByRole("button", { name: LOCATION_A.name, exact: true })
      .click();
    await page.goto("/guest-information");
    await expect(page.getByLabel("6-digit authenticator code")).toBeVisible();
    await page.getByLabel("6-digit authenticator code").fill("123456");
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await expect.poll(() => stepUps).toBe(1);
    await page.goto("/help");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await signInOnCurrentPage(page, "manager@example.com");
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page
      .getByRole("button", { name: LOCATION_A.name, exact: true })
      .click();
    await page.goto("/guest-information");
  } finally {
    pending.release();
  }
  await expect(page.getByLabel("6-digit authenticator code")).toBeVisible();
  await expect(page.getByText(previewMarker(), { exact: true })).toHaveCount(0);
  expect(fixture.mfaAssured).toBe(false);
});

test("#409 MFA-denied Contact PUT preserves unsaved edits without automatic replay", async ({
  page,
}) => {
  const { fixture, state } = issue409GuestMfaFixture("ASSURED");
  await enterIssue409GuestPage(page, fixture);
  await page.locator('[data-view-target="contact"]').click();
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  await page.getByRole("button", { name: "Set a location value" }).click();
  const phone = page.locator("#guest-information-override-phone");
  await phone.fill("0790000000");
  await expect(page.getByText("Unsaved edits", { exact: true })).toBeVisible();

  state.denyWrites = true;
  fixture.mfaState = "STEP_UP_REQUIRED";
  fixture.mfaAssured = false;
  await page
    .getByRole("button", { name: "Save location", exact: true })
    .click();
  await expect.poll(() => state.writes).toBe(1);
  await expect(phone).toHaveValue("0790000000");
  await expect(page.getByText("Unsaved edits", { exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  expect(state.writes).toBe(1);
  await expect(page.getByText("Contact saved.", { exact: true })).toHaveCount(
    0,
  );
});

test("#409 an expired protected GET never returns a synthetic success", async ({
  page,
}) => {
  const { fixture, state } = issue409GuestMfaFixture("ASSURED");
  state.readFailure = "UNAUTHENTICATED";
  await enterIssue409GuestPage(page, fixture);
  await expect
    .poll(() => fixture.count(guestPaths().privacy))
    .toBeGreaterThan(0);
  await expect(page.getByText(previewMarker(), { exact: true })).toHaveCount(0);
  expect(fixture.count("/v1/staff/auth/mfa/step-up")).toBe(0);
  expect(fixture.count("/v1/staff/auth/refresh")).toBeGreaterThan(0);
});
