import { expect, test, type Page } from "@playwright/test";
import { enterR08, r08Fixture, r08Path } from "./support/r08-accountability";
import { incidentItem } from "./support/operations-fixtures";

const longReporter = `${"عبدالرحمن".repeat(8)} ${"الخطيب".repeat(8)}`;

async function openIncident(page: Page, locale: "ar" | "en", width: number) {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = r08Fixture((path) => path === r08Path("incidents")
    ? { body: {
      items: [{ ...incidentItem(), reporterDisplayName: longReporter }],
      nextCursor: null,
    } }
    : undefined);
  await enterR08(page, "/incidents", fixture);
  if (locale === "ar") await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
  await page.setViewportSize({ width, height: 900 });
  const opener = page.locator("tbody tr").first().getByRole("button");
  await opener.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(longReporter, { exact: true })).toBeVisible();
  return { dialog, opener };
}

test("#314 Incident Details reflows at 160 effective CSS px in RTL and LTR without clipping controls or Facts", async ({ page }) => {
  for (const locale of ["ar", "en"] as const) {
    const { dialog, opener } = await openIncident(page, locale, 160);
    const close = dialog.getByRole("button", { name: locale === "ar" ? "إغلاق" : "Close" });
    await expect(close).toBeFocused();
    const layout = await dialog.evaluate((node) => {
      const viewport = document.documentElement.clientWidth;
      const boxes = [node.querySelector("h2"), ...node.querySelectorAll("button, strong, strong bdi, div[class*='_factList'] > div")]
        .filter((element): element is Element => element instanceof Element)
        .map((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const box = element.getBoundingClientRect();
          const textBox = range.getBoundingClientRect();
          return {
            tag: element.tagName,
            left: box.left,
            right: box.right,
            textLeft: textBox.left,
            textRight: textBox.right,
          };
        });
      const scroller = Array.from(node.querySelectorAll("div"))
        .find((element) => typeof element.className === "string" && element.className.includes("_drawerBody"));
      return { viewport, boxes, scrollWidth: scroller?.scrollWidth, clientWidth: scroller?.clientWidth };
    });
    expect(layout.boxes.length).toBeGreaterThan(15);
    for (const box of layout.boxes) {
      expect(box.left, `${locale} ${box.tag} left`).toBeGreaterThanOrEqual(-0.5);
      expect(box.right, `${locale} ${box.tag} right`).toBeLessThanOrEqual(layout.viewport + 0.5);
      expect(box.textLeft, `${locale} ${box.tag} text left`).toBeGreaterThanOrEqual(-0.5);
      expect(box.textRight, `${locale} ${box.tag} text right`).toBeLessThanOrEqual(layout.viewport + 0.5);
    }
    expect(layout.scrollWidth).toBeLessThanOrEqual((layout.clientWidth ?? 0) + 1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  }
});

test("#314 ordinary 320px Incident Details keeps the approved drawer layout", async ({ page }) => {
  const { dialog } = await openIncident(page, "ar", 320);
  const layout = await dialog.evaluate((node) => {
    const header = node.firstElementChild;
    const body = node.lastElementChild;
    const facts = body?.firstElementChild;
    const firstFact = facts?.firstElementChild;
    return {
      headerWrap: header ? getComputedStyle(header).flexWrap : null,
      headerPadding: header ? getComputedStyle(header).paddingInlineStart : null,
      bodyPadding: body ? getComputedStyle(body).paddingInlineStart : null,
      factLayout: firstFact ? getComputedStyle(firstFact).display : null,
      factGap: firstFact ? getComputedStyle(firstFact).gap : null,
    };
  });
  expect(layout).toEqual({
    headerWrap: "nowrap",
    headerPadding: "24px",
    bodyPadding: "24px",
    factLayout: "flex",
    factGap: "16px",
  });
});
