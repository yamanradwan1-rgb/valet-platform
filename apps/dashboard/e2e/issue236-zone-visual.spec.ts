import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  Issue236ZoneState,
  zoneFixture,
} from "./support/issue236-parking-zones";
import { enterPhysicalResources } from "./support/keys-spots";

for (const locale of ["en", "ar"] as const) {
  for (const narrow of [false, true]) {
    test(`${locale} ${narrow ? "dark narrow" : "light desktop"} zone dialog preserves native geometry, focus and bidi`, async ({
      page,
    }) => {
      const state = new Issue236ZoneState();
      await page.setViewportSize({ width: 1440, height: 900 });
      await zoneFixture(state).install(page);
      await enterPhysicalResources(page);
      if (narrow)
        await page.getByRole("button", { name: "Dark", exact: true }).click();
      if (locale === "ar")
        await page
          .getByRole("button", { name: "Language", exact: true })
          .click();
      const ar = locale === "ar";
      if (narrow) await page.setViewportSize({ width: 480, height: 900 });
      await page
        .getByRole("tab", { name: ar ? "مواقف السيارات" : "Parking Spots" })
        .click();
      await page
        .getByRole("button", {
          name: ar ? "إضافة موقف" : "Add Parking Spot",
          exact: true,
        })
        .click();
      const spot = page.getByRole("dialog", {
        name: ar ? "إضافة موقف" : "Add Parking Spot",
        exact: true,
      });
      await expect(
        spot.getByLabel(ar ? "منطقة الوقوف" : "Parking Zone"),
      ).toBeEnabled();
      await spot
        .getByRole("button", {
          name: ar ? "إضافة منطقة وقوف" : "Add Parking Zone",
        })
        .focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", {
        name: ar ? "إضافة منطقة وقوف" : "Add Parking Zone",
      });
      const code = dialog.getByLabel(ar ? "الرمز" : "Code");
      await expect(code).toBeFocused();
      await expect(code).toHaveAttribute("dir", "ltr");
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        ar ? "rtl" : "ltr",
      );
      await code.fill("Z:١-A");
      await page.keyboard.press("Tab");
      await expect(dialog.getByLabel(ar ? "التسمية" : "Label")).toBeFocused();
      await page.keyboard.type(ar ? "منطقة أمامية" : "Front Zone");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await expect(code).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(
        dialog.getByRole("button", {
          name: ar ? "إنشاء" : "Create",
          exact: true,
        }),
      ).toBeFocused();
      await expect(page.getByRole("dialog")).toHaveCount(1);
      const box = (await dialog.boundingBox())!;
      expect(box.width).toBeLessThanOrEqual(448);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(narrow ? 480 : 1440);
      await expect(dialog).toHaveCSS("padding", narrow ? "16px" : "24px");
      await page.evaluate(async () => document.fonts.ready);
      const output = join(process.cwd(), "../../tmp/issue236/visual");
      mkdirSync(output, { recursive: true });
      await page.screenshot({
        path: join(
          output,
          `zone-${locale}-${narrow ? "dark-narrow" : "light-desktop"}.png`,
        ),
        fullPage: true,
      });
      await page.keyboard.press("Escape");
      await expect(
        spot.getByRole("button", {
          name: ar ? "إضافة منطقة وقوف" : "Add Parking Zone",
        }),
      ).toBeFocused();
    });
  }
}

test("standalone Zone creation uses a fresh authoritative read on the next Add Spot", async ({
  page,
}) => {
  const state = new Issue236ZoneState();
  await zoneFixture(state).install(page);
  await enterPhysicalResources(page);
  await page.getByRole("tab", { name: "Parking Spots" }).click();
  await page.getByRole("button", { name: "Add Parking Zone" }).click();
  const zone = page.getByRole("dialog", { name: "Add Parking Zone" });
  await zone.getByLabel("Code").fill("STANDALONE");
  await zone.getByLabel("Label").fill("Standalone Zone");
  await zone.getByRole("button", { name: "Create", exact: true }).click();
  await expect(zone).toHaveCount(0);
  expect(state.reads).toHaveLength(0);
  await page.getByRole("button", { name: "Add Parking Spot" }).click();
  const spot = page.getByRole("dialog", { name: "Add Parking Spot" });
  await expect(
    spot
      .getByLabel("Parking Zone")
      .locator("option", { hasText: "Standalone Zone" }),
  ).toHaveCount(1);
  expect(state.reads).toEqual([null]);
});
