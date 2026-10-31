import { open, geometry, expect, evidence } from "./browser-support.mjs";

const sections = [
  "operations",
  "payments",
  "hours",
  "tracking",
  "notifications",
  "presence",
  "zones",
  "whatsapp",
];
export async function runMatrix(page) {
  const results = [];
  page.on("dialog", (dialog) => dialog.accept());
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 1000 : 1000 });
    for (const locale of ["en", "ar"])
      for (const theme of ["light", "dark"]) {
        for (const section of sections) {
          await open(
            page,
            `locale=${locale}&theme=${theme}&scope=location&section=${section}`,
          );
          await expect(page.locator("html")).toHaveAttribute(
            "dir",
            locale === "ar" ? "rtl" : "ltr",
          );
          await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            theme,
          );
          const measurements = await geometry(page);
          const failures = measurements.filter((item) => item.overflow);
          results.push({
            width,
            locale,
            theme,
            section,
            status: failures.length ? "FAIL" : "PASS",
            measurements,
          });
          if (failures.length)
            console.log("OVERFLOW", width, locale, theme, section, failures);
          const firstEdit = page.locator(".ps-edit-button").first();
          if (section === "hours")
            await page
              .getByRole("button", {
                name: locale === "ar" ? "تعديل الجدول" : "Edit schedule",
                exact: true,
              })
              .click();
          else if (section === "whatsapp")
            await page
              .getByRole("button", {
                name:
                  locale === "ar"
                    ? "تعديل إعدادات واتساب"
                    : "Edit WhatsApp settings",
                exact: true,
              })
              .click();
          else if (section === "zones")
            await page
              .getByRole("button", {
                name: locale === "ar" ? "إضافة منطقة" : "Add zone",
                exact: true,
              })
              .click();
          else if (await firstEdit.count()) await firstEdit.click();
          {
            const editing = await geometry(page);
            results.push({
              width,
              locale,
              theme,
              section,
              state: "editing",
              status: editing.some((item) => item.overflow) ? "FAIL" : "PASS",
              measurements: editing,
            });
            if (editing.some((item) => item.overflow))
              console.log(
                "EDITOR OVERFLOW",
                width,
                locale,
                theme,
                section,
                editing,
              );
          }
          // The next matrix case starts a new fixture without a browser unload dialog.
          await page.evaluate(() => {
            localStorage.removeItem("vaylet-321-studio-v1");
            window.onbeforeunload = null;
          });
        }
        console.log("Matrix complete", width, locale, theme);
      }
  }
  // Effective-width reflow, explicitly not native browser zoom.
  for (const [percent, width] of [
    [160, 900],
    [200, 720],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    for (const locale of ["en", "ar"]) {
      await open(
        page,
        `locale=${locale}&theme=dark&scope=location&section=hours`,
      );
      await page
        .getByRole("button", {
          name: locale === "ar" ? "تعديل الجدول" : "Edit schedule",
          exact: true,
        })
        .click();
      const measurements = await geometry(page);
      results.push({
        check: "Effective-width reflow; not native zoom",
        percent,
        width,
        locale,
        status: measurements.some((item) => item.overflow) ? "FAIL" : "PASS",
        measurements,
      });
    }
  }
  await page.setViewportSize({ width: 390, height: 1000 });
  await open(page, "locale=en&theme=light");
  await page.locator(".ps-mobile-index").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".ps-section-links")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".ps-mobile-index")).toBeFocused();
  await expect(page.locator(".ps-section-links")).toBeHidden();
  results.push({
    check: "Mobile secondary navigation Enter, Escape and focus",
    status: "PASS",
  });
  return results;
}

export async function screenshots(page) {
  await page.evaluate(() => localStorage.removeItem("vaylet-321-studio-v1"));
  for (const [name, width, height, query] of [
    ["en-light-desktop", 1440, 1000, "locale=en&theme=light"],
    ["ar-dark-desktop", 1440, 1000, "locale=ar&theme=dark"],
    ["en-light-mobile", 390, 1000, "locale=en&theme=light"],
    ["ar-dark-mobile", 390, 1000, "locale=ar&theme=dark"],
  ]) {
    await page.setViewportSize({ width, height });
    await open(page, query);
    await page.locator("#studio-heading").evaluate((el) => el.blur());
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
    await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, "locale=en&theme=light&scope=location&section=operations");
  const row = page.locator('[data-setting="handoffStandardMethodPolicy"]');
  await row
    .getByRole("button", { name: "Edit: Handoff method", exact: true })
    .click();
  await row.getByLabel("Draft · Handoff method").selectOption("DYNAMIC_QR");
  await page.locator("#studio-heading").evaluate((el) => el.focus());
  await page.locator("#studio-heading").evaluate((el) => el.blur());
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
  await page.screenshot({
    path: `${evidence}/location-override-edit.png`,
    fullPage: true,
  });
}
