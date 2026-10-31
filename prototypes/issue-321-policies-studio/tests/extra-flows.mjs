import { open, section, edit, expect } from "./browser-support.mjs";

export async function extraFlows(page) {
  const results = [];
  await open(page, "locale=en&theme=light");
  await section(page, "Task tracking");
  const row = await edit(page, "rawGpsRetentionDays");
  await row.locator("input").fill("17");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.goBack();
  await expect(page.locator("#studio-heading")).toHaveText("Task tracking");
  await expect(row.locator("input")).toHaveValue("17");
  page.once("dialog", (dialog) => dialog.accept());
  await page.goBack();
  await expect(page.locator("#studio-heading")).toHaveText(
    "Vehicle operations",
  );
  results.push({
    name: "Dirty browser Back: cancel restores URL and draft, accept discards",
    status: "PASS",
  });

  await open(page, "section=whatsapp");
  await page
    .getByRole("button", { name: "Edit WhatsApp settings", exact: true })
    .click();
  await page
    .getByRole("combobox", {
      name: "Company / Location sending policy",
      exact: true,
    })
    .selectOption("true");
  await page
    .getByRole("button", { name: "Save WhatsApp settings", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Not saved");
  await page
    .getByRole("combobox", {
      name: "Company / Location sending policy",
      exact: true,
    })
    .selectOption("false");
  await page
    .getByRole("combobox", { name: "Message language", exact: true })
    .selectOption("en");
  await page
    .getByRole("button", { name: "Save WhatsApp settings", exact: true })
    .click();
  await expect(page.locator('[data-setting="waLanguage"]')).toContainText(
    "English",
  );
  results.push({
    name: "WhatsApp bundled save and missing onboarding validation",
    status: "PASS",
  });

  await open(page, "scope=location&section=presence");
  const presence = await edit(page, "shiftStartPresenceMode");
  await presence.locator(".ps-editor-context summary").click();
  await presence.getByLabel("Setting source").selectOption("custom");
  await presence
    .getByLabel("Draft · Start Shift Presence Mode")
    .selectOption("REQUIRE");
  await presence.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Confirm presence mode", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(presence.locator(".ps-setting-value strong")).toHaveText("Off");
  await presence.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("button", { name: "Save simulation", exact: true })
    .click();
  await expect(presence.locator(".ps-setting-value strong")).toHaveText(
    "Require",
  );
  results.push({
    name: "Strict-mode confirmation and saved/draft separation",
    status: "PASS",
  });

  await open(page, "scope=location&section=hours");
  await page
    .getByRole("button", { name: "Edit schedule", exact: true })
    .click();
  await page.getByLabel("Monday opens at", { exact: true }).fill("23:00");
  await page.getByLabel("Monday closes at", { exact: true }).fill("08:00");
  await page
    .locator(".ps-schedule")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Closing time must be after",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await open(page);
  results.push({
    name: "Schedule rejects reversed/overnight interval matching source",
    status: "PASS",
  });
  return results;
}
