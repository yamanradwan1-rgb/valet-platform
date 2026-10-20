import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, type Page } from "@playwright/test";

/** Never substitutes a generated reference for the Owner-approved HTML. */
export function approvedHtml() {
  const source = process.env.ISSUE304_APPROVED_HTML;
  const expected = process.env.ISSUE304_APPROVED_SHA256?.toLowerCase();
  if (!source || !expected || !/^[a-f0-9]{64}$/u.test(expected)) {
    throw new Error("Set ISSUE304_APPROVED_HTML and the full 64-character ISSUE304_APPROVED_SHA256 from Prime's approval ledger.");
  }
  const absolute = resolve(source);
  if (!existsSync(absolute)) throw new Error(`Approved HTML unavailable at ${absolute}`);
  const bytes = readFileSync(absolute);
  const actual = createHash("sha256").update(bytes).digest("hex");
  expect(actual, "Owner-approved HTML changed or wrong reference selected").toBe(expected);
  return { uri: pathToFileURL(absolute).href, hash: actual };
}

export async function configureApprovedHtml(page: Page, locale: "en" | "ar", theme: "light" | "dark") {
  const html = page.locator("html");
  if (locale === "ar") await page.locator('[data-shell-locale]').click();
  await expect(html).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
  await page.locator(`[data-shell-theme="${theme}"]`).click();
  await expect(html).toHaveAttribute("data-theme", theme);
}

/** Diagnostic pixel delta on equal-size scaled canvases; never an automatic parity PASS. */
export async function compareViewportPixels(
  actualPage: Page,
  approvedPng: Buffer,
  actualPng: Buffer,
) {
  return actualPage.evaluate(async ({ baseline, candidate }) => {
    const decode = (encoded: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Unable to decode screenshot PNG"));
      img.src = `data:image/png;base64,${encoded}`;
    });
    const [a, b] = await Promise.all([decode(baseline), decode(candidate)]);
    const width = 600, height = 450;
    const pixels = (image: HTMLImageElement) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas 2D unavailable");
      ctx.drawImage(image, 0, 0, width, height);
      return ctx.getImageData(0, 0, width, height).data;
    };
    const pa = pixels(a), pb = pixels(b);
    let changed = 0;
    for (let index = 0; index < pa.length; index += 4) {
      const distance = Math.abs(pa[index]! - pb[index]!) +
        Math.abs(pa[index + 1]! - pb[index + 1]!) +
        Math.abs(pa[index + 2]! - pb[index + 2]!);
      if (distance > 45) changed++;
    }
    return { referenceSize: [a.width, a.height], liveSize: [b.width, b.height],
      changedPixels: changed, comparedPixels: width * height,
      changedRatio: changed / (width * height),
      note: "Diagnostic only: images resized to common canvas; manual review required" };
  }, { baseline: approvedPng.toString("base64"), candidate: actualPng.toString("base64") });
}

export async function visualLandmarks(page: Page, selector: string) {
  return page.locator(selector).evaluate((root) => {
    const rect = (element: Element | null) => {
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return { x: Math.round(bounds.x), y: Math.round(bounds.y),
        width: Math.round(bounds.width), height: Math.round(bounds.height) };
    };
    const cards = [...root.querySelectorAll('[data-c-kpi]')];
    const headline = root.querySelector("h1");
    const switcher = root.querySelector('.c-family-switch, [data-testid="issue304-family-switch"]');
    return { title: rect(headline), kpis: cards.map(rect), familySwitcher: rect(switcher),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      titleFont: headline ? getComputedStyle(headline).fontFamily : null };
  });
}
