import { expect, test } from "@playwright/test";
import { enterR08, r08Fixture } from "./support/r08-accountability";

for (const route of ["keys", "incidents", "audit-log"] as const) {
  test(`${route} keyboard Inspect, containment, Escape, opener and backdrop`, async ({
    page,
  }) => {
    await enterR08(page, `/${route}`, r08Fixture(), route === "audit-log");
    await expect(page.getByRole("columnheader").first()).toBeVisible();
    const opener = page.locator("tbody tr").first().getByRole("button");
    await expect(opener).toHaveAccessibleName(/Details:|Inspect event/u);
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    const close = dialog.getByRole("button", { name: "Close", exact: true });
    await expect(close).toBeFocused();
    await page.keyboard.press("Tab");
    if (route === "incidents") {
      await expect(
        dialog.getByRole("button", { name: "Mark Resolved", exact: true }),
      ).toBeFocused();
    } else await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await page.keyboard.press("Enter");
    await dialog.locator("..").click({ position: { x: 5, y: 100 } });
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
}
