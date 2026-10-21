import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { installPhotoScenario, openPhotos } from "./photo-scenario-fixture";

const output = resolve(__dirname, "results/focus-outline");

type Boundary = {
  key: string;
  side: "first" | "last";
  tile: { x: number; y: number; right: number; bottom: number };
  section: { x: number; y: number; right: number; bottom: number };
  outline: string;
  clipMargin: string;
  focusVisible: boolean;
  files: { before: string; focused: string };
};

async function stateFocus(page: Page, key: string, side: "first" | "last"): Promise<Boundary> {
  const section = page.locator('[class*="photoSection"]');
  const tile = side === "first"
    ? section.locator('button[class*="photoTile"]').first()
    : section.locator('button[class*="photoTile"]').last();
  await tile.scrollIntoViewIfNeeded();
  const files = { before: `${key}-${side}-before.png`, focused: `${key}-${side}-focused.png` };
  const sectionRect = await section.boundingBox();
  const tileRect = await tile.boundingBox();
  expect(sectionRect).not.toBeNull();
  expect(tileRect).not.toBeNull();
  await tile.evaluate((element) => (element as HTMLElement).blur());
  await page.screenshot({ path: resolve(output, files.before), animations: "disabled" });
  await page.keyboard.press("Tab");
  await tile.focus();
  await expect(tile).toBeFocused();
  const state = await tile.evaluate((el) => {
    const host = el.closest('section[class*="photoSection"]')!;
    const getRect = (rect: DOMRect) => ({ x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom });
    return {
      focusVisible: el.matches(":focus-visible"),
      tile: getRect(el.getBoundingClientRect()),
      section: getRect(host.getBoundingClientRect()),
      outline: getComputedStyle(el).outline,
      clipMargin: getComputedStyle(host).overflowClipMargin,
    };
  });
  expect(state.focusVisible, `${key} ${side} outline must be keyboard-visible`).toBe(true);
  expect(state.outline).toMatch(/3px/);
  expect(state.clipMargin).toBe("6px");
  await page.screenshot({ path: resolve(output, files.focused), animations: "disabled" });
  return { key, side, files, ...state };
}

test.beforeAll(() => mkdirSync(output, { recursive: true }));

for (const surface of ["vehicles", "live-operations"] as const) {
  test(`${surface} after focus-safe paint: EN/AR Light/Dark 320/390 first + last tile, aria viewer`, async ({ page }) => {
    test.setTimeout(180_000);
    const { setup } = installPhotoScenario(page, "three");
    await setup();
    await openPhotos(page, surface);
    const observations: Boundary[] = [];
    for (const entry of [
      { lang: "en", theme: "light", next: "none" },
      { lang: "en", theme: "dark", next: "dark" },
      { lang: "ar", theme: "dark", next: "language" },
      { lang: "ar", theme: "light", next: "light" },
    ] as const) {
      if (entry.next !== "none") {
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await page.setViewportSize({ width: 1440, height: 900 });
        if (entry.next === "dark") await page.getByRole("button", { name: "Dark" }).click();
        if (entry.next === "language") await page.getByRole("button", { name: "Language" }).click();
        if (entry.next === "light") await page.getByRole("button", { name: "فاتح" }).click();
        await page.getByRole("table").getByRole("button", { name: /Details|التفاصيل/u }).first().click();
      }
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const key = `${surface}-${entry.lang}-${entry.theme}-${width}`;
        for (const side of ["first", "last"] as const) {
          observations.push(await stateFocus(page, key, side));
        }
        const first = page.locator('[class*="photoSection"] button[class*="photoTile"]').first();
        await first.focus();
        await page.keyboard.press("Enter");
        const viewer = page.locator('[class*="viewerBackdrop"] [role="dialog"]');
        await expect(viewer).toHaveAttribute("aria-modal", "true");
        const titleId = await viewer.getAttribute("aria-labelledby");
        const descriptionId = await viewer.getAttribute("aria-describedby");
        expect(titleId).toBeTruthy();
        expect(descriptionId).toBeTruthy();
        await expect(viewer.locator(`#${titleId}`)).toBeVisible();
        await expect(viewer.locator(`#${descriptionId}`)).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(viewer).toHaveCount(0);
        await expect(first).toBeFocused();
      }
    }
    expect(observations).toHaveLength(16);
    writeFileSync(resolve(output, `${surface}-focus-results.json`), JSON.stringify({
      source: "actual Next/React candidate", candidate: process.env.ISSUE309_CANDIDATE_SHA,
      screenshots: observations, cases: observations.length,
    }, null, 2));
  });
}
