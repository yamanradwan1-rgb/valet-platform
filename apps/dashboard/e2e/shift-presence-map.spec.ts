import { expect, test } from "@playwright/test";
import { PresenceFixture, fillZone } from "./support/presence-fixtures";

import { mockPresenceMap } from "./support/presence-map-mock";

test("Google adapter mock: one draft, metric circle, unmirrored RTL and lifecycle disposal", async ({
  page,
}) => {
  const languages = await mockPresenceMap(page);
  const f = new PresenceFixture();
  await f.open(page);
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const dialog = await fillZone(page);
  expect(await page.evaluate(() => window.presenceMapMock.schemes)).toEqual([
    "LIGHT",
  ]);
  await dialog
    .getByRole("button", { name: "Mock geographic click", exact: true })
    .click();
  await expect(dialog.getByLabel("Latitude", { exact: true })).toHaveValue(
    "32",
  );
  await expect(dialog.getByLabel("Longitude", { exact: true })).toHaveValue(
    "36",
  );
  await dialog.getByLabel("Latitude", { exact: true }).fill("31");
  await dialog.getByLabel("Longitude", { exact: true }).fill("35");
  await dialog.getByLabel("Radius (meters)", { exact: true }).fill("50.5");
  await expect
    .poll(() => page.evaluate(() => window.presenceMapMock.pin))
    .toEqual({ lat: 31, lng: 35 });
  expect(await page.evaluate(() => window.presenceMapMock.radius)).toBe(50.5);
  await page.evaluate(() => {
    localStorage.setItem("vaylet_dashboard_locale", "ar");
    window.dispatchEvent(new Event("vaylet-dashboard-locale-change"));
  });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page
      .getByRole("dialog")
      .getByLabel("الخريطة الجغرافية لمنطقة الحضور")
      .locator(".."),
  ).toHaveAttribute("dir", "ltr");
  expect(await page.evaluate(() => window.presenceMapMock.pin)).toEqual({
    lat: 31,
    lng: 35,
  });
  await expect(page.getByRole("dialog")).toContainText("تحتفظ تسميات الخريطة");
  expect(languages).toEqual(["en"]);
  expect(f.writes).toHaveLength(0);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.presenceMapMock.removed)).toBe(1);
  expect(await page.evaluate(() => window.presenceMapMock.cleared)).toBe(3);
  expect(await page.evaluate(() => window.presenceMapMock.pinAttached)).toBe(
    false,
  );
  expect(await page.evaluate(() => window.presenceMapMock.circleAttached)).toBe(
    false,
  );
});
