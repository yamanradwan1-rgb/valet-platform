import { expect, test } from "@playwright/test";

import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { areaItem, operationsReadReply, pointItem } from "./support/operations-fixtures";

const pointsPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/points`;
const areasPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/areas`;

test("issue379 parent locale re-render preserves editor focus, Tab and Escape", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === pointsPath) return { body: { points: [pointItem()] } };
      if (path === areasPath) return { body: { areas: [areaItem()] } };
      return operationsReadReply(path);
    },
  });
  await fixture.install(page);
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await page.getByRole("button", { name: "Setup / Operational Areas" }).click();
  const opener = page.getByRole("button", { name: "Add Point" });
  const openerHandle = await opener.elementHandle();
  await opener.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName("Add Point");
  const input = dialog.locator("input").first();
  await input.fill("FOCUS379");
  await expect(input).toBeFocused();
  await page.evaluate(async () => {
    localStorage.setItem("vaylet_dashboard_locale", "ar");
    window.dispatchEvent(new Event("vaylet-dashboard-locale-change"));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const retained = await input.evaluate((node) => document.activeElement === node);
  await test.info().attach("issue379-rtl-focus-after", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await test.info().attach("issue379-focus-after-parent-render", {
    body: JSON.stringify({ retained, active: await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      ariaLabel: document.activeElement?.getAttribute("aria-label"),
    })) }),
    contentType: "application/json",
  });
  await input.focus();
  await input.press("Tab");
  await expect(dialog.locator("input").nth(1)).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await openerHandle?.evaluate((node) => document.activeElement === node)).toBe(true);
  expect(retained).toBe(true);
});
