import { expect, test } from "@playwright/test";

test.describe("Employee Web viewport accessibility", () => {
  for (const { locale, direction } of [
    { locale: "en", direction: "ltr" },
    { locale: "ar", direction: "rtl" },
  ]) {
    test(`allows user zoom with ${locale} document direction`, async ({
      page,
      context,
    }) => {
      await page.goto("/");
      await context.addCookies([
        {
          name: "vaylet_employee_locale",
          value: locale,
          url: page.url(),
        },
      ]);
      await page.reload();

      const content = await page
        .locator('meta[name="viewport"]')
        .getAttribute("content");
      expect(content).not.toBeNull();

      const directives = new Map(
        (content ?? "").split(",").map((part) => {
          const [key, value] = part.trim().split("=");
          return [key.trim(), value?.trim()];
        }),
      );
      expect(directives.get("width")).toBe("device-width");
      expect(directives.get("initial-scale")).toBe("1");
      expect(directives.has("maximum-scale")).toBe(false);
      expect(directives.has("user-scalable")).toBe(false);

      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute("dir", direction);
    });
  }
});
