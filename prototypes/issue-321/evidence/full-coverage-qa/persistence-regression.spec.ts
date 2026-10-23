import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import playwrightTest from "../../../../apps/dashboard/node_modules/@playwright/test/index.js";

const { expect, test } = playwrightTest;
const evidence = fileURLToPath(new URL("./", import.meta.url));
const nav = ".issue321-a-link, .p321-b-link, .p321-c-nav-button, .issue321-option-d__nav-button";
const url = (variant: string, section: string) =>
  `/${variant}?section=${section}&scenario=company-with-location&lang=en&theme=light`;
type Outcome = { variant: string; feature: string; result: "PASS" | "FAIL"; error?: string };
const outcomes: Outcome[] = [];

async function check(variant: string, feature: string, action: () => Promise<void>) {
  try {
    await action();
    outcomes.push({ variant, feature, result: "PASS" });
  } catch (error) {
    outcomes.push({ variant, feature, result: "FAIL", error: String(error).slice(0, 1400) });
  }
}

test("A/B/C/D save simulation state survives switching sections in same SPA session", async ({ page }) => {
  test.setTimeout(360_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const apiRequests: string[] = [];
  page.on("request", request => {
    if (/\/(?:api|graphql|trpc)\b/i.test(request.url())) apiRequests.push(request.url());
  });

  for (const variant of ["a", "b", "c", "d"]) {
    const choose = async (sectionLabel: string) => {
      const button = page.locator(nav).filter({ hasText: sectionLabel }).first();
      await expect(button).toBeVisible();
      await button.click();
    };

    await check(variant, "attendance zone persists after section switch", async () => {
      await page.goto(url(variant, "presence"));
      await page.getByRole("button", { name: "Add zone" }).click();
      const editor = page.getByRole("dialog", { name: "Add Attendance Zone" });
      await editor.getByLabel("Label").fill("QA Persistent Zone");
      await editor.getByLabel("Code").fill("QA_ZONE");
      await editor.getByRole("textbox", { name: "Latitude", exact: true }).fill("32.01234");
      await editor.getByRole("textbox", { name: "Longitude", exact: true }).fill("35.98765");
      await editor.getByLabel("Radius (meters)").fill("120");
      await editor.getByRole("button", { name: "Save Simulation" }).click();
      await expect(page.locator(".p321-zones-table tbody")).toContainText("QA_ZONE");
      await choose("Company Defaults");
      await choose("Shift Presence");
      await expect(page.locator(".p321-zones-table tbody")).toContainText("QA_ZONE");
    });

    await check(variant, "Operating Hours saved schedule survives section switch", async () => {
      await page.goto(url(variant, "company"));
      const hours = page.locator(".p321-hours-full");
      await hours.getByRole("combobox", { name: "Monday — Status" }).selectOption("OPEN");
      await hours.locator('[aria-label="Monday — Opens"]').fill("09:00");
      await hours.locator('[aria-label="Monday — Closes"]').fill("17:00");
      await hours.getByRole("button", { name: "Save schedule" }).click();
      await choose("Location Overrides");
      await choose("Company Defaults");
      const savedHours = page.locator(".p321-hours-full");
      await expect(savedHours.getByRole("combobox", { name: "Monday — Status" })).toHaveValue("OPEN");
      await expect(savedHours.locator('[aria-label="Monday — Opens"]')).toHaveValue("09:00");
      await expect(savedHours.locator('[aria-label="Monday — Closes"]')).toHaveValue("17:00");
    });

    await check(variant, "WhatsApp policy saved language survives section switch", async () => {
      await page.goto(url(variant, "company"));
      const whatsApp = page.locator(".p321-wa");
      await whatsApp.getByRole("combobox", { name: "Message language" }).selectOption("en");
      await whatsApp.getByRole("button", { name: "Save WhatsApp settings (simulated)" }).click();
      await choose("Location Overrides");
      await choose("Company Defaults");
      await expect(page.locator(".p321-wa").getByRole("combobox", { name: "Message language" })).toHaveValue("en");
    });

    await check(variant, "Location SLA saved value survives section switch", async () => {
      await page.goto(url(variant, "location"));
      const sla = page.locator(".p321-sla-full");
      await sla.getByRole("textbox", { name: "SLA target seconds" }).fill("300");
      await sla.getByRole("button", { name: "Save", exact: true }).click();
      await choose("Company Defaults");
      await choose("Location Overrides");
      const savedSla = page.locator(".p321-sla-full");
      await expect(savedSla.getByRole("textbox", { name: "SLA target seconds" })).toHaveValue("300");
      await expect(savedSla.locator(".p321-sla-value")).toContainText("300");
    });
  }

  writeFileSync(join(evidence, "persistence-results.json"), JSON.stringify({
    total: outcomes.length, passed: outcomes.filter(item => item.result === "PASS").length,
    failed: outcomes.filter(item => item.result === "FAIL").length, apiRequests, cases: outcomes,
  }, null, 2));
  expect(outcomes).toHaveLength(16);
  expect(apiRequests, "Mock saves must not contact VAYLET APIs").toHaveLength(0);
  expect(outcomes.filter(item => item.result === "FAIL"), JSON.stringify(outcomes, null, 2)).toHaveLength(0);
});

test("read-only Presence capability denies edits and exception review across all variants", async ({ page }) => {
  for (const variant of ["a", "b", "c", "d"]) {
    await page.goto(`/${variant}?section=presence&scenario=location-manager-read-only&lang=en&theme=light`);
    await expect(page.getByRole("button", { name: "Add zone" })).toHaveCount(0);
    await page.getByTestId("presence-view-policy").click();
    await expect(page.locator(".p321-presence-policy select").first()).toBeDisabled();
    for (const saveButton of await page.locator(".p321-presence-policy .p321-save").all()) {
      await expect(saveButton).toBeDisabled();
    }
    await page.getByTestId("presence-view-exceptions").click();
    await expect(page.locator(".p321-presence-exceptions .p321-zone-hint").filter({ hasText: "cannot approve or reject" })).toBeVisible();
    await page.getByRole("button", { name: "Load a fictional request to inspect the review flow" }).click();
    await page.getByRole("button", { name: "Details" }).click();
    await expect(page.getByRole("dialog", { name: "Review synthetic presence request" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve (simulated)" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Review synthetic presence request" })).not.toBeVisible();
  }
});

test("synthetic presence exception review demands explicit confirmation and remains mock-only", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", request => {
    if (/\/(?:api|graphql|trpc)\b/i.test(request.url())) apiRequests.push(request.url());
  });
  for (const variant of ["a", "b", "c", "d"]) {
    await page.goto(url(variant, "presence"));
    await page.getByTestId("presence-view-exceptions").click();
    await page.getByRole("button", { name: "Load a fictional request to inspect the review flow" }).click();
    const opener = page.getByRole("button", { name: "Review", exact: true });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Review synthetic presence request" });
    await expect(dialog).toBeVisible();
    page.once("dialog", confirmation => confirmation.dismiss());
    await dialog.getByRole("button", { name: "Approve (simulated)" }).click();
    await expect(dialog).toBeVisible();
    page.once("dialog", confirmation => confirmation.accept());
    await dialog.getByRole("button", { name: "Approve (simulated)" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("Approved (simulated)")).toBeVisible();
    const details = page.getByRole("button", { name: "Details" });
    await details.click();
    await expect(page.getByRole("button", { name: "Approve (simulated)" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(details).toBeFocused();
  }
  expect(apiRequests, "Synthetic review must not call VAYLET APIs").toHaveLength(0);
});
