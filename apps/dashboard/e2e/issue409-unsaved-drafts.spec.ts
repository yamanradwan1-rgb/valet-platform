import { expect, test } from "@playwright/test";

import {
  completeIssue409StepUp as completeStepUp,
  denyNextPreviewWithMfa,
  enterIssue409GuestPage,
  issue409GuestMfaFixture,
} from "./support/issue409-guest-information-mfa-fixture";

test("#409 RED Contact keeps an unsaved phone and dirty state across nested MFA remount", async ({
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
  await expect(phone).toHaveCount(0);
  await completeStepUp(page);
  await page.locator('[data-view-target="contact"]').click();
  if (!(await phone.isVisible())) {
    await page.getByRole("button", { name: "Customize", exact: true }).click();
    const setValue = page.getByRole("button", { name: "Set a location value" });
    if (await setValue.isVisible()) await setValue.click();
  }
  await expect(phone).toHaveValue("0795432199");
  await expect(page.getByText("Unsaved edits", { exact: true })).toBeVisible();
  expect(state.writes).toBe(0);
});

test("#409 RED Privacy keeps unsaved text and dirty state across nested MFA remount", async ({
  page,
}) => {
  const { fixture, state } = issue409GuestMfaFixture("ASSURED");
  await enterIssue409GuestPage(page, fixture);
  await page.locator('[data-view-target="privacy"]').first().click();
  await page.getByRole("button", { name: "Edit privacy", exact: true }).click();
  const textField = page.locator('[data-field="privacy.text"]');
  await textField.fill("Unsaved #409 privacy draft");
  await expect(page.getByText("Unsaved edits", { exact: true })).toBeVisible();
  const challenged = await denyNextPreviewWithMfa(page);
  fixture.mfaState = "STEP_UP_REQUIRED";
  fixture.mfaAssured = false;
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await expect(page.locator("#mfa-totp-mfaVerify")).toBeVisible();
  expect(challenged()).toBe(true);
  await expect(textField).toHaveCount(0);
  await completeStepUp(page);
  await page.locator('[data-view-target="privacy"]').first().click();
  if (!(await textField.isVisible())) {
    await page
      .getByRole("button", { name: "Edit privacy", exact: true })
      .click();
  }
  await expect(textField).toHaveValue("Unsaved #409 privacy draft");
  await expect(page.getByText("Unsaved edits", { exact: true })).toBeVisible();
  expect(state.writes).toBe(0);
});

test("#409 changed Contact revision asks before restoring a stale unsaved draft", async ({
  page,
}) => {
  const { fixture, state } = issue409GuestMfaFixture("ASSURED");
  await enterIssue409GuestPage(page, fixture);
  await page.locator('[data-view-target="contact"]').click();
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  await page.getByRole("button", { name: "Set a location value" }).click();
  await page.locator("#guest-information-override-phone").fill("0795432199");
  const challenged = await denyNextPreviewWithMfa(page);
  fixture.mfaState = "STEP_UP_REQUIRED";
  fixture.mfaAssured = false;
  state.contactRevision = 1;
  const confirmations: string[] = [];
  page.on("dialog", async (dialog) => {
    confirmations.push(dialog.message());
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await expect(page.locator("#mfa-totp-mfaVerify")).toBeVisible();
  expect(challenged()).toBe(true);
  await completeStepUp(page);
  await expect(page.locator("#guest-information-override-phone")).toHaveValue(
    "0795432199",
  );
  await expect(page.getByText("Unsaved edits", { exact: true })).toBeVisible();
  expect(confirmations).toHaveLength(1);
  expect(confirmations[0]).toContain("تغيّرت هذه الإعدادات");
  expect(state.writes).toBe(0);
  await page
    .getByRole("button", { name: "Save location", exact: true })
    .click();
  await expect.poll(() => state.writes).toBe(1);
  expect(state.lastWriteExpectedRevision).toBe(1);
});

test("#409 changed Privacy revision restores server value only after explicit discard", async ({
  page,
}) => {
  const { fixture, state } = issue409GuestMfaFixture("ASSURED");
  await enterIssue409GuestPage(page, fixture);
  await page.locator('[data-view-target="privacy"]').first().click();
  await page.getByRole("button", { name: "Edit privacy", exact: true }).click();
  await page.locator('[data-field="privacy.text"]').fill("Stale private draft");
  const challenged = await denyNextPreviewWithMfa(page);
  fixture.mfaState = "STEP_UP_REQUIRED";
  fixture.mfaAssured = false;
  state.privacyRevision = 1;
  const confirmations: string[] = [];
  page.on("dialog", async (dialog) => {
    confirmations.push(dialog.message());
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await expect(page.locator("#mfa-totp-mfaVerify")).toBeVisible();
  expect(challenged()).toBe(true);
  await completeStepUp(page);
  await expect(page.locator('[data-field="privacy.text"]')).toHaveValue(
    "Updated elsewhere",
  );
  await expect(page.getByText("Unsaved edits", { exact: true })).toHaveCount(0);
  expect(confirmations).toHaveLength(1);
  expect(confirmations[0]).toContain("تغيّرت هذه الإعدادات");
  expect(state.writes).toBe(0);
});

test("#409 changed Contact revision discards the draft only after explicit confirmation", async ({
  page,
}) => {
  const { fixture, state } = issue409GuestMfaFixture("ASSURED");
  await enterIssue409GuestPage(page, fixture);
  await page.locator('[data-view-target="contact"]').click();
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  await page.getByRole("button", { name: "Set a location value" }).click();
  await page.locator("#guest-information-override-phone").fill("0795432199");
  const challenged = await denyNextPreviewWithMfa(page);
  fixture.mfaState = "STEP_UP_REQUIRED";
  fixture.mfaAssured = false;
  state.contactRevision = 1;
  const confirmations: string[] = [];
  page.on("dialog", async (dialog) => {
    confirmations.push(dialog.message());
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await expect(page.locator("#mfa-totp-mfaVerify")).toBeVisible();
  expect(challenged()).toBe(true);
  await completeStepUp(page);
  await expect(page.locator("#guest-information-override-phone")).toHaveValue(
    "+962799999888",
  );
  await expect(page.getByText("Unsaved edits", { exact: true })).toHaveCount(0);
  expect(confirmations).toHaveLength(1);
  expect(confirmations[0]).toContain("تغيّرت هذه الإعدادات");
  expect(state.writes).toBe(0);
});

test("#409 changed Privacy revision keeps edits for review only after explicit confirmation", async ({
  page,
}) => {
  const { fixture, state } = issue409GuestMfaFixture("ASSURED");
  await enterIssue409GuestPage(page, fixture);
  await page.locator('[data-view-target="privacy"]').first().click();
  await page.getByRole("button", { name: "Edit privacy", exact: true }).click();
  await page
    .locator('[data-field="privacy.text"]')
    .fill("Private draft for review");
  const challenged = await denyNextPreviewWithMfa(page);
  fixture.mfaState = "STEP_UP_REQUIRED";
  fixture.mfaAssured = false;
  state.privacyRevision = 1;
  const confirmations: string[] = [];
  page.on("dialog", async (dialog) => {
    confirmations.push(dialog.message());
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await expect(page.locator("#mfa-totp-mfaVerify")).toBeVisible();
  expect(challenged()).toBe(true);
  await completeStepUp(page);
  await expect(page.locator('[data-field="privacy.text"]')).toHaveValue(
    "Private draft for review",
  );
  await expect(page.getByText("Unsaved edits", { exact: true })).toBeVisible();
  expect(confirmations).toHaveLength(1);
  expect(confirmations[0]).toContain("تغيّرت هذه الإعدادات");
  expect(state.writes).toBe(0);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => state.writes).toBe(1);
  expect(state.lastWriteExpectedRevision).toBe(1);
});

test("#409 simultaneous Privacy keep and Contact discard decisions are resource-specific", async ({
  page,
}) => {
  const { fixture, state } = issue409GuestMfaFixture("ASSURED");
  await enterIssue409GuestPage(page, fixture);
  await page.locator('[data-view-target="privacy"]').first().click();
  await page.getByRole("button", { name: "Edit privacy", exact: true }).click();
  const privacyText = page.locator('[data-field="privacy.text"]');
  await privacyText.fill("Keep this private draft");
  await page.locator('[data-view-target="contact"]').click();
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  await page.getByRole("button", { name: "Set a location value" }).click();
  const phone = page.locator("#guest-information-override-phone");
  await phone.fill("0795432199");
  const challenged = await denyNextPreviewWithMfa(page);
  fixture.mfaState = "STEP_UP_REQUIRED";
  fixture.mfaAssured = false;
  state.privacyRevision = 1;
  state.contactRevision = 1;
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    if (dialogs.length === 1) await dialog.accept();
    else await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await expect(page.locator("#mfa-totp-mfaVerify")).toBeVisible();
  expect(challenged()).toBe(true);
  await completeStepUp(page);
  expect(dialogs).toHaveLength(2);
  expect(
    dialogs.every((message) => message.includes("تغيّرت هذه الإعدادات")),
  ).toBe(true);
  await page.locator('[data-view-target="contact"]').click();
  await expect(phone).toHaveValue("+962799999888");
  await expect(
    page.locator('[data-view="contact"]').getByText("Unsaved edits", {
      exact: true,
    }),
  ).toHaveCount(0);
  await page.locator('[data-view-target="privacy"]').first().click();
  await expect(privacyText).toHaveValue("Keep this private draft");
  await expect(
    page.locator('[data-view="privacy"]').getByText("Unsaved edits", {
      exact: true,
    }),
  ).toBeVisible();
  expect(state.writes).toBe(0);
});
