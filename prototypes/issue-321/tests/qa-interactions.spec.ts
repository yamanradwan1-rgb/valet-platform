import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import playwrightTest from "../../../apps/dashboard/node_modules/@playwright/test/index.js";

const { expect, test } = playwrightTest;
const evidence = fileURLToPath(new URL("../evidence/qa/", import.meta.url));
const results: Array<{ option: string; name: string; result: "PASS" | "FAIL"; details?: string }> = [];

const localNavButtons = ".issue321-a-link, .p321-b-link, .p321-c-nav-button, .issue321-option-d__nav-button";

async function probe(option: string, name: string, action: () => Promise<void>) {
  try {
    await action();
    results.push({ option, name, result: "PASS" });
  } catch (error) {
    results.push({ option, name, result: "FAIL", details: String(error).slice(0, 1000) });
  }
}

test("A/B/C/D keyboard, deep links, roles, Help, Save and unsaved protection", async ({ page }) => {
  test.setTimeout(300_000);
  mkdirSync(evidence, { recursive: true });

  for (const option of ["a", "b", "c", "d"]) {
    const url = (section: string, scenario = "company-with-location", locale = "en") =>
      `/${option}?section=${section}&scenario=${scenario}&lang=${locale}&theme=light`;
    const chooseSection = async (name: string) => {
      const button = page.locator(localNavButtons).filter({ hasText: name }).first();
      await expect(button).toBeVisible();
      await button.focus();
      await page.keyboard.press("Enter");
    };

    await probe(option, "deep link + Refresh", async () => {
      await page.goto(url("presence"));
      await expect(page.locator(".p321-pane h2").first()).toContainText("Shift Presence");
      await page.reload();
      await expect(page.locator(".p321-pane h2").first()).toContainText("Shift Presence");
      await expect(page.locator(localNavButtons).filter({ hasText: "Shift Presence" })).toHaveAttribute("aria-current", /^(page|true)$/);
    });

    await probe(option, "legacy ?tab=services", async () => {
      await page.goto(`/${option}?tab=services&scenario=company-with-location&lang=en&theme=light`);
      await expect(page.locator(".p321-pane h2").first()).toContainText("Service Status");
      await expect(page.locator(".p321-pane .p321-save")).toHaveCount(0);
    });

    await probe(option, "keyboard section switching + Back/Forward", async () => {
      await page.goto(url("company"));
      await chooseSection("Location Overrides");
      await expect(page).toHaveURL(/section=location/);
      await expect(page.locator(".p321-pane h2").first()).toContainText("Location Overrides");
      await page.goBack();
      await expect(page.locator(".p321-pane h2").first()).toContainText("Company Defaults");
      await page.goForward();
      await expect(page.locator(".p321-pane h2").first()).toContainText("Location Overrides");
    });

    await probe(option, "Help Escape closes and focus returns", async () => {
      await page.goto(url("company"));
      const help = page.getByRole("button", { name: /Help: Check-in photos required/ });
      await help.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await expect(help).toBeFocused();
    });

    await probe(option, "dirty draft blocks section change when rejected", async () => {
      await page.goto(url("company"));
      const field = page.locator('[id="field-company:checkInPhotosRequired"]');
      await field.selectOption("true");
      let asked = false;
      page.once("dialog", async dialog => { asked = true; await dialog.dismiss(); });
      await chooseSection("Location Overrides");
      expect(asked).toBeTruthy();
      await expect(page).toHaveURL(/section=company/);
      await expect(field).toHaveValue("true");
    });

    await probe(option, "accepted discard clears draft", async () => {
      await page.goto(url("company"));
      const field = page.locator('[id="field-company:checkInPhotosRequired"]');
      await field.selectOption("true");
      page.once("dialog", dialog => dialog.accept());
      await chooseSection("Location Overrides");
      await expect(page).toHaveURL(/section=location/);
      page.once("dialog", dialog => dialog.accept());
      await chooseSection("Company Defaults");
      await expect(field).toHaveValue("false");
    });

    await probe(option, "Save changes only prototype state", async () => {
      await page.goto(url("company"));
      const field = page.locator('[id="field-company:checkInPhotosRequired"]');
      await field.selectOption("true");
      const row = page.locator(".p321-setting-row").filter({ has: field });
      await row.getByRole("button", { name: "Save", exact: true }).click();
      await expect(row.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
      await expect(page.getByRole("status").filter({ hasText: /Saved to prototype memory/ })).toBeVisible();
    });

    await probe(option, "invalid negative raw-GPS retention rejected", async () => {
      await page.goto(url("company"));
      const field = page.locator('[id="field-company:rawGpsRetentionDays"]');
      await field.fill("-1");
      const row = page.locator(".p321-setting-row").filter({ has: field });
      await row.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByRole("alert")).toBeVisible();
    });

    await probe(option, "Location Manager access matrix", async () => {
      await page.goto(url("company", "location-manager"));
      const labels = await page.locator(localNavButtons).allTextContents();
      expect(labels.join("|")).not.toContain("Company Defaults");
      expect(labels.join("|")).not.toContain("Service Status");
      expect(labels.join("|")).toContain("Location Overrides");
      expect(labels.join("|")).toContain("Shift Presence");
    });

    await probe(option, "denied role has no editable section", async () => {
      await page.goto(url("company", "denied"));
      await expect(page.locator(localNavButtons)).toHaveCount(0);
      await expect(page.locator(".p321-setting-row")).toHaveCount(0);
    });

    await probe(option, "no-location empty state prevents override editing", async () => {
      await page.goto(url("location", "company-no-location"));
      await expect(page.locator(".p321-empty")).toBeVisible();
      await expect(page.locator(".p321-setting-row")).toHaveCount(0);
    });

    await probe(option, "Arabic page direction and section navigation", async () => {
      await page.goto(url("location", "company-with-location", "ar"));
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.locator(localNavButtons).filter({ hasText: "حضور الورديات" })).toBeVisible();
    });
  }

  writeFileSync(join(evidence, "interaction-results.json"), JSON.stringify({
    cases: results, total: results.length,
    passed: results.filter(item => item.result === "PASS").length,
    failed: results.filter(item => item.result === "FAIL").length,
  }, null, 2));
  expect(results).toHaveLength(48);
});
