import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { installPhotoScenario, openPhotos } from "./photo-scenario-fixture";

const output = resolve(__dirname, "results/paint-diagnosis");

async function snapshot(page: Page, variant: string) {
  await page.evaluate(() => document.fonts.ready);
  const computed = await page.getByRole("dialog").evaluate((drawer) => {
    const body = drawer.children.item(1) as HTMLElement;
    const facts = body.children.item(0)!;
    const label = facts.children.item(0)?.children.item(0) ?? null;
    const value = facts.children.item(0)?.children.item(1) ?? null;
    const photo = body.children.item(1) ?? null;
    const summarize = (node: Element | null) => {
      if (!node) return null;
      const c = getComputedStyle(node);
      const r = node.getBoundingClientRect();
      return {
        tag: node.tagName,
        className: String(node.className).slice(0, 150),
        text: node.textContent?.trim().slice(0, 75),
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        color: c.color, background: c.backgroundColor, filter: c.filter,
        opacity: c.opacity, mixBlendMode: c.mixBlendMode,
        font: c.fontFamily, weight: c.fontWeight, lineHeight: c.lineHeight,
        textRendering: c.textRendering, transform: c.transform,
        willChange: c.willChange, overflow: c.overflow,
        contain: c.contain, isolation: c.isolation,
      };
    };
    return {
      body: summarize(body), facts: summarize(facts),
      label: summarize(label), value: summarize(value),
      photo: summarize(photo), header: summarize(drawer.children.item(0)),
      scrollHeight: body.scrollHeight, clientHeight: body.clientHeight,
      documentTheme: document.documentElement.dataset.theme,
    };
  });
  await page.screenshot({ path: resolve(output, `${variant}.png`), animations: "disabled" });
  writeFileSync(resolve(output, `${variant}.json`), JSON.stringify(computed, null, 2));
}

test("One-case actual React paint cause: source or candidate, no source edits", async ({ page }) => {
  test.setTimeout(100_000);
  mkdirSync(output, { recursive: true });
  const variant = process.env.ISSUE309_VARIANT ?? "candidate";
  const { setup, releaseLoading } = installPhotoScenario(page, "three");
  await setup();
  try {
    await openPhotos(page, "vehicles");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Dark" }).click();
    await page.setViewportSize({ width: 390, height: 900 });
    await page.getByRole("table").getByRole("button", { name: /Details|التفاصيل/u }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await snapshot(page, `${variant}-normal`);
    const photo = page.locator('[class*="photoSection"]');
    if (await photo.count()) {
      await photo.evaluate((node) => { (node as HTMLElement).style.display = "none"; });
      await snapshot(page, `${variant}-photo-display-none`);
      await photo.evaluate((node) => { (node as HTMLElement).style.display = ""; (node as HTMLElement).style.visibility = "hidden"; });
      await snapshot(page, `${variant}-photo-visibility-hidden`);
      await photo.evaluate((node) => { (node as HTMLElement).style.visibility = ""; (node as HTMLElement).style.contain = "paint"; });
      await snapshot(page, `${variant}-photo-contain-paint`);
      await photo.evaluate((node) => {
        (node as HTMLElement).style.contain = "none";
        (node as HTMLElement).style.isolation = "isolate";
      });
      await snapshot(page, `${variant}-photo-isolation-only`);
      await photo.evaluate((node) => {
        (node as HTMLElement).style.isolation = "";
        (node as HTMLElement).style.contain = "paint";
      });
      const firstTile = photo.locator('button[class*="photoTile"]').first();
      await expect(firstTile).toBeVisible();
      await snapshot(page, `${variant}-photo-before-focus`);
      await page.keyboard.press("Tab");
      await firstTile.focus();
      await expect(firstTile).toBeFocused();
      const focusDetails = await firstTile.evaluate((tile) => {
        const section = tile.closest('section[class*="photoSection"]')!;
        const r = tile.getBoundingClientRect(), b = section.getBoundingClientRect();
        const cs = getComputedStyle(tile);
        return {
          focusVisible: tile.matches(":focus-visible"),
          tile: { x: r.x, y: r.y, width: r.width, height: r.height },
          section: { x: b.x, y: b.y, width: b.width, height: b.height },
          outline: cs.outline,
          outlineOffset: cs.outlineOffset,
        };
      });
      writeFileSync(resolve(output, `${variant}-focus-geometry.json`), JSON.stringify(focusDetails, null, 2));
      await snapshot(page, `${variant}-photo-focused-contained`);
      await photo.evaluate((node) => { (node as HTMLElement).style.overflowClipMargin = "6px"; });
      await snapshot(page, `${variant}-photo-focused-clip-margin`);
    }
  } finally {
    releaseLoading();
  }
});
