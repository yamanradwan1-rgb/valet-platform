import { open, edit, section, expect, geometry } from "./browser-support.mjs";

export async function usabilityFlows(page) {
  const results = [];
  await open(page, "locale=en&theme=light&scope=location&section=tracking");
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  const row = await edit(page, "rawGpsRetentionDays");
  await expect(row.locator("input")).toBeEnabled();
  await row.locator("input").fill("14");
  await row.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row.locator(".ps-setting-value > strong")).toHaveText("14 days");
  await expect(row.locator(".ps-row-saved")).toHaveText(
    "Saved in this preview.",
  );
  results.push({
    name: "No search; direct inherited editing and inline save feedback",
    status: "PASS",
  });
  await edit(page, "rawGpsRetentionDays");
  await row.locator("input").fill("18");
  await page
    .locator(".ps-section-links")
    .getByRole("link", { name: "Payments & validation", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Discard unsaved changes?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(row.locator("input")).toHaveValue("18");
  await page
    .locator(".ps-section-links")
    .getByRole("link", { name: "Payments & validation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Discard & continue", exact: true })
    .click();
  await expect(page.locator("#studio-heading")).toHaveText(
    "Payments & validation",
  );
  results.push({
    name: "Navigation preserves unsaved-change protection",
    status: "PASS",
  });
  await page.setViewportSize({ width: 320, height: 1000 });
  await open(page, "locale=ar&theme=dark&scope=company");
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await section(page, "الدفع والمصادقة");
  expect((await geometry(page)).some((item) => item.overflow)).toBe(false);
  results.push({
    name: "Arabic mobile navigation without search and without overflow",
    status: "PASS",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  return results;
}
