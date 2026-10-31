import { open, section, edit, expect, evidence } from "./browser-support.mjs";

export async function runFlows(page) {
  const results = [];
  async function check(name, fn) {
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS", name);
  }
  await open(page, "locale=en&theme=light");
  await page.evaluate(() => localStorage.removeItem("vaylet-321-studio-v1"));
  await page.reload();
  await check(
    "Local save, draft/effective separation, persistence",
    async () => {
      const row = await edit(page, "checkInPhotosRequired");
      await row.locator("select").selectOption("true");
      await expect(row.locator(".ps-setting-value strong")).toHaveText("No");
      await row.getByRole("button", { name: "Save", exact: true }).click();
      await expect(row.locator(".ps-setting-value strong")).toHaveText("Yes");
      await page.reload();
      await expect(
        page.locator(
          '[data-setting="checkInPhotosRequired"] .ps-setting-value strong',
        ),
      ).toHaveText("Yes");
    },
  );
  await check("Existing Help, Escape, focus return and Tab trap", async () => {
    const row = await edit(page, "handoffStandardMethodPolicy");
    const help = row.getByRole("button", {
      name: "Help: Handoff method",
      exact: true,
    });
    await help.focus();
    await page.keyboard.press("Space");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Shift+Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(help).toBeFocused();
    await row.getByRole("button", { name: "Cancel", exact: true }).click();
  });
  await check(
    "Unsaved navigation modal: keep, discard; section focus",
    async () => {
      const row = await edit(page, "checkInPhotosRequired");
      await row.locator("select").selectOption("false");
      await page
        .locator(".ps-section-links")
        .getByRole("link", { name: "Payments & validation", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Discard unsaved changes?" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Keep editing" }).click();
      await expect(row.locator("select")).toHaveValue("false");
      await page
        .locator(".ps-section-links")
        .getByRole("link", { name: "Payments & validation", exact: true })
        .click();
      await page.getByRole("button", { name: "Discard & continue" }).click();
      await expect(page.locator("#studio-heading")).toHaveText(
        "Payments & validation",
      );
      await expect(page.locator("#studio-heading")).toBeFocused();
    },
  );
  await check(
    "Browser Back, Forward, Refresh, removed service link fallback",
    async () => {
      await section(page, "Task tracking");
      await page.goBack();
      await expect(page.locator("#studio-heading")).toHaveText(
        "Payments & validation",
      );
      await page.goForward();
      await expect(page.locator("#studio-heading")).toHaveText("Task tracking");
      await page.reload();
      await expect(page.locator("#studio-heading")).toHaveText("Task tracking");
      await open(page, "tab=services");
      await expect(page.locator("#studio-heading")).toHaveText(
        "Vehicle operations",
      );
    },
  );
  await check(
    "Override, Clear Override, inheritance and organization isolation",
    async () => {
      await open(page, "scope=location&section=operations");
      let row = await edit(page, "checkInPhotosRequired");
      await row.locator(".ps-editor-context summary").click();
      await row.getByLabel("Setting source").selectOption("custom");
      await row
        .getByLabel("Draft · Check-in photos required")
        .selectOption("false");
      await row.getByRole("button", { name: "Save", exact: true }).click();
      await expect(row.locator(".ps-setting-value strong")).toHaveText("No");
      await expect(row.locator(".ps-source").first()).toHaveText(
        "Location override",
      );
      await open(page, "scope=location&location=marina");
      await expect(
        page.locator(
          '[data-setting="checkInPhotosRequired"] .ps-setting-value strong',
        ),
      ).toHaveText("Yes");
      await open(page, "org=demo-valet&scope=company");
      await expect(
        page.locator(
          '[data-setting="checkInPhotosRequired"] .ps-setting-value strong',
        ),
      ).toHaveText("No");
      await open(page, "scope=location");
      row = await edit(page, "checkInPhotosRequired");
      await row
        .getByRole("button", { name: "Clear Override", exact: true })
        .click();
      await expect(row.locator(".ps-setting-value strong")).toHaveText("Yes");
      await expect(row.locator(".ps-source").first()).toHaveText("Inherited");
    },
  );
  await check("Numeric validation and Location-only SLA", async () => {
    await open(page, "scope=location&section=hours");
    const row = await edit(page, "slaTargetSeconds");
    await row.locator("input").fill("29");
    await row.getByRole("button", { name: "Save", exact: true }).click();
    await expect(row.getByRole("alert")).toBeVisible();
    await row.locator("input").fill("300");
    await row.getByRole("button", { name: "Save", exact: true }).click();
    await expect(row.locator(".ps-setting-value strong")).toHaveText("300 sec");
    await open(page, "scope=company&section=hours");
    await expect(page.locator('[data-setting="slaTargetSeconds"]')).toHaveCount(
      0,
    );
  });
  await check(
    "Seven-day schedule: saved locally and clear-to-inherit",
    async () => {
      await open(page, "scope=location&section=hours");
      await page
        .getByRole("button", { name: "Edit schedule", exact: true })
        .click();
      await page
        .getByLabel("Monday status", { exact: true })
        .selectOption("CLOSED");
      await page
        .locator(".ps-schedule")
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await expect(page.locator(".ps-day").first()).toContainText("Closed");
      await page.reload();
      await expect(page.locator(".ps-day").first()).toContainText("Closed");
      await page
        .getByRole("button", { name: "Edit schedule", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Clear Override", exact: true })
        .click();
      await expect(page.locator(".ps-day").first()).toContainText("08:00");
    },
  );
  await check("Offline zone selection, edit, create, persistence", async () => {
    await open(page, "scope=location&section=zones");
    await page.getByRole("button", { name: "Add zone", exact: true }).click();
    await page.getByLabel("Code", { exact: true }).fill("DEMO-NORTH");
    await page
      .getByLabel("Zone label", { exact: true })
      .fill("Demo north entry");
    const before = await page
      .getByLabel("Longitude", { exact: true })
      .inputValue();
    await page
      .getByRole("button", { name: "Move point →", exact: true })
      .click();
    expect(
      await page.getByLabel("Longitude", { exact: true }).inputValue(),
    ).not.toBe(before);
    await page.getByLabel("Radius (meters)", { exact: true }).fill("95");
    await page.screenshot({
      path: `${evidence}/attendance-zone-edit.png`,
      fullPage: true,
    });
    await page
      .locator(".ps-zone-form")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(page.locator(".ps-zone-list")).toContainText(
      "Demo north entry",
    );
    await page.reload();
    await expect(page.locator(".ps-zone-list")).toContainText(
      "Demo north entry",
    );
    await page.getByText("Demo north entry", { exact: true }).click();
    await page
      .locator(".ps-zone-details")
      .filter({ hasText: "Demo north entry" })
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    await page.getByLabel("Status", { exact: true }).selectOption("DISABLED");
    await page
      .locator(".ps-zone-form")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(page.locator(".ps-zone-list")).toContainText("Disabled");
  });
  await check(
    "Company Admin, Location Manager, denied, no-location, read-only capability",
    async () => {
      await open(page, "role=LOCATION_MANAGER&section=operations");
      await expect(
        page.getByRole("button", { name: "Company defaults", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.locator('[data-setting="ocrAssistEnabled"]'),
      ).toHaveCount(0);
      await expect(page.locator(".ps-section-links")).not.toContainText(
        "Service Status",
      );
      await section(page, "Shift Presence");
      await expect(
        page.getByRole("button", {
          name: "Edit: Start Shift Presence Mode",
          exact: true,
        }),
      ).toBeVisible();
      await open(
        page,
        "role=LOCATION_MANAGER&section=presence&scenario=readonly",
      );
      await expect(
        page.locator('.ps-setting-tools button[aria-label^="Edit:"]'),
      ).toHaveCount(0);
      await expect(page.locator(".ps-scope-note")).toContainText(
        "Read-only capability fixture",
      );
      await open(page, "role=DENIED");
      await expect(
        page.getByText("Access unavailable", { exact: true }),
      ).toBeVisible();
      await expect(page.locator("[data-setting]")).toHaveCount(0);
      await open(page, "scope=location&location=none");
      await expect(
        page.getByRole("heading", { name: "Select a location" }),
      ).toBeVisible();
      await expect(page.locator("[data-setting]")).toHaveCount(0);
    },
  );
  await check("Loading, empty, denied, error/retry", async () => {
    for (const scenario of ["loading", "empty", "denied"]) {
      await open(page, `scenario=${scenario}`);
      await expect(page.locator("[data-setting]")).toHaveCount(0);
    }
    await open(page, "scenario=error");
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.locator("[data-setting]")).toHaveCount(4);
  });
  await check("WhatsApp policy distinct from live activation", async () => {
    await open(page, "section=whatsapp");
    await expect(page.locator(".ps-message-note")).toContainText(
      "Live sending is disabled",
    );
    await expect(page.locator('[data-setting="waTemplate"]')).toContainText(
      "No approved template",
    );
    await expect(page.locator('[data-setting="waBinding"]')).toContainText(
      "No verified sender connection",
    );
  });
  return results;
}
