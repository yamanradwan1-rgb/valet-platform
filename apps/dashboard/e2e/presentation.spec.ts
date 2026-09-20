import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  expectMd01NavigationOnly,
  openLocationManagerWorkspace,
} from "./support/foundation-ui";

function locationManagerFixture(): DashboardApiFixture {
  return new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
}

test("theme and locale switch the real document between light/LTR and dark/RTL", async ({
  page,
}) => {
  const fixture = locationManagerFixture();
  await fixture.install(page);
  await openLocationManagerWorkspace(page);

  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(root).toHaveAttribute("lang", "en");
  await expect(root).toHaveAttribute("dir", "ltr");

  await page.getByRole("button", { name: "Theme" }).click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Language" }).click();
  await expect(root).toHaveAttribute("lang", "ar");
  await expect(root).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { name: "مساحة العمل المصرح بها" }),
  ).toBeVisible();
});

test("mobile navigation traps focus, closes on Escape, and restores the opener", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = locationManagerFixture();
  await fixture.install(page);
  await openLocationManagerWorkspace(page);

  const opener = page.getByRole("button", { name: "Open navigation" });
  await expect(opener).toBeVisible();
  await opener.focus();
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Management navigation" });
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close navigation" }),
  ).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("link", { name: "Help" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("foundation shell exposes only real MD-01 controls", async ({ page }) => {
  const fixture = locationManagerFixture();
  await fixture.install(page);
  await openLocationManagerWorkspace(page);
  await expectMd01NavigationOnly(page);

  for (const name of ["Profile", "Notifications", "Messages", "Search"]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
    await expect(page.getByRole("link", { name })).toHaveCount(0);
  }
  await expect(page.getByRole("searchbox")).toHaveCount(0);
});
