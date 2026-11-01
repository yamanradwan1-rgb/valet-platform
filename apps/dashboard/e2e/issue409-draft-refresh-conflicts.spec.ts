import { expect, test, type Page } from "@playwright/test";

import {
  enterIssue409GuestPage,
  guestPaths,
  issue409GuestMfaFixture,
} from "./support/issue409-guest-information-mfa-fixture";
import type { DashboardApiFixture } from "./support/dashboard-api-fixture";
import {
  enterGuestContact,
  guestContactFixture,
} from "./support/guest-contact-fixture";

async function refreshCurrentStaffSession(
  page: Page,
  fixture: DashboardApiFixture,
) {
  let challenged = false;
  const previousRefreshes = fixture.count("/v1/staff/auth/refresh");
  await page.route("**" + guestPaths().preview + "*", async (route) => {
    if (challenged) return route.fallback();
    challenged = true;
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        code: "STAFF_AUTHENTICATION_REQUIRED",
        message: "Session refresh required",
        requestId: "issue409-ordinary-token-refresh",
      }),
    });
  });
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await expect
    .poll(() => fixture.count("/v1/staff/auth/refresh"))
    .toBeGreaterThan(previousRefreshes);
  await expect(
    page.getByRole("heading", { name: "الخصوصية والتواصل" }),
  ).toBeVisible();
  expect(challenged).toBe(true);
  await expect(page.locator("#mfa-totp-mfaVerify")).toHaveCount(0);
}

test("#409 ordinary same-session refresh asks before retaining changed Contact revision", async ({
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

  const prompts: string[] = [];
  page.on("dialog", async (dialog) => {
    prompts.push(dialog.message());
    await dialog.accept();
  });
  state.contactRevision = 1;
  await refreshCurrentStaffSession(page, fixture);
  await expect.poll(() => prompts.length).toBe(1);
  expect(prompts[0]).toContain("تغيّرت هذه الإعدادات");
  await page.locator('[data-view-target="contact"]').click();
  await expect(phone).toHaveValue("0795432199");
  await expect(
    page.getByText("تعديلات غير محفوظة", { exact: true }),
  ).toBeVisible();
  expect(state.writes).toBe(0);
  await page.getByRole("button", { name: "حفظ الموقع", exact: true }).click();
  await expect.poll(() => state.writes).toBe(1);
  expect(state.lastWriteExpectedRevision).toBe(1);
});

test("#409 ordinary same-session refresh discards changed Privacy draft only on explicit cancellation", async ({
  page,
}) => {
  const { fixture, state } = issue409GuestMfaFixture("ASSURED");
  await enterIssue409GuestPage(page, fixture);
  await page.locator('[data-view-target="privacy"]').first().click();
  await page.getByRole("button", { name: "Edit privacy", exact: true }).click();
  const field = page.locator('[data-field="privacy.text"]');
  await field.fill("Draft before ordinary refresh");
  await expect(page.getByText("Unsaved edits", { exact: true })).toBeVisible();

  const prompts: string[] = [];
  page.on("dialog", async (dialog) => {
    prompts.push(dialog.message());
    await dialog.dismiss();
  });
  state.privacyRevision = 1;
  await refreshCurrentStaffSession(page, fixture);
  await expect.poll(() => prompts.length).toBe(1);
  expect(prompts[0]).toContain("تغيّرت هذه الإعدادات");
  await page.locator('[data-view-target="privacy"]').first().click();
  await expect(field).toHaveValue("");
  await page.getByRole("button", { name: "اللغة", exact: true }).click();
  await expect(field).toHaveValue("Updated elsewhere");
  await expect(
    page.getByText("تعديلات غير محفوظة", { exact: true }),
  ).toHaveCount(0);
  expect(state.writes).toBe(0);
});

test("#409 unchanged revision after ordinary refresh restores without conflict confirmation", async ({
  page,
}) => {
  const { fixture, state } = issue409GuestMfaFixture("ASSURED");
  await enterIssue409GuestPage(page, fixture);
  await page.locator('[data-view-target="contact"]').click();
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  await page.getByRole("button", { name: "Set a location value" }).click();
  const phone = page.locator("#guest-information-override-phone");
  await phone.fill("0795432199");
  const prompts: string[] = [];
  page.on("dialog", async (dialog) => {
    prompts.push(dialog.message());
    await dialog.dismiss();
  });
  await refreshCurrentStaffSession(page, fixture);
  await page.locator('[data-view-target="contact"]').click();
  await expect(phone).toHaveValue("0795432199");
  expect(prompts).toHaveLength(0);
  expect(state.writes).toBe(0);
});

test("#409 Company defaults keep-confirmation saves only with the freshly authorized revision", async ({
  page,
}) => {
  const { fixture, state } = guestContactFixture();
  await enterGuestContact(page, fixture);
  await page
    .locator("summary")
    .filter({ hasText: "Company contact defaults" })
    .click();
  await page
    .getByRole("button", { name: "Edit defaults", exact: true })
    .click();
  const name = page.locator("#guest-information-company-displayName");
  await name.fill("Company draft before refresh");
  await expect(page.getByText("Unsaved edits", { exact: true })).toBeVisible();

  state.companyRevision = 1;
  state.company.displayName = "Company server revision one";
  const prompts: string[] = [];
  page.on("dialog", async (dialog) => {
    prompts.push(dialog.message());
    await dialog.accept();
  });
  await refreshCurrentStaffSession(page, fixture);
  await expect.poll(() => prompts.length).toBe(1);
  expect(state.puts).toBe(0);
  await page
    .locator("summary")
    .filter({ hasText: "بيانات التواصل الافتراضية للشركة" })
    .click();
  await expect(name).toHaveValue("Company draft before refresh");
  await page
    .getByRole("button", { name: "حفظ افتراضيات الشركة", exact: true })
    .click();
  await expect.poll(() => state.companyRevision).toBe(2);
  expect(state.puts).toBe(1);
  expect(state.company.displayName).toBe("Company draft before refresh");
  expect(prompts).toHaveLength(1);
});
