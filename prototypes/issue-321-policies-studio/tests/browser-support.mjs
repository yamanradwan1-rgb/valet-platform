import { requireDashboard, root } from "../scripts/runtime.mjs";
export const { chromium, expect } = requireDashboard("@playwright/test");
export const base = process.env.PREVIEW_URL || "http://127.0.0.1:4321";
export const evidence = `${root}/evidence`;
export async function open(page, query = "") {
  await page.goto(`${base}/policies?${query}`);
  await page.locator("#studio-heading").waitFor();
  await page.evaluate(() => document.fonts.ready);
}
export async function section(page, name) {
  if (await page.locator(".ps-mobile-index").isVisible())
    await page.locator(".ps-mobile-index").click();
  await page
    .locator(".ps-section-links")
    .getByRole("link", { name, exact: true })
    .click();
  await expect(page.locator("#studio-heading")).toHaveText(name);
}
export async function edit(page, key) {
  await page
    .locator(`[data-setting="${key}"]`)
    .getByRole("button", { name: /^Edit:/ })
    .click();
  return page.locator(`[data-setting="${key}"]`);
}
export async function geometry(page) {
  return page.evaluate(() => {
    const selectors = ["html", "body", ".content", ".ps-workspace", ".ps-pane"];
    return selectors.flatMap((selector) => {
      const el = document.querySelector(selector);
      if (!el) return [];
      return [
        {
          selector,
          width: el.clientWidth,
          scroll: el.scrollWidth,
          overflow: el.scrollWidth > el.clientWidth + 1,
        },
      ];
    });
  });
}
