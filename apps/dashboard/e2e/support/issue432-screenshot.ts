import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, type Page } from "@playwright/test";

const evidenceDirectory = resolve(process.cwd(), "../../", "docs/plans/issue-432/qa-artifacts/real-dashboard");

export async function captureIssue432State(page: Page, state: string, variant: "a" | "b" = "a") {
  const controls = page.getByRole("complementary", { name: "Demo controls" });
  const controlsOpen = await controls.isVisible();
  if (controlsOpen) {
    await page.keyboard.press("Control+Shift+P");
    await expect(controls).toBeHidden();
  }
  await expect(controls).toBeHidden();
  const metadata = await page.locator("html").evaluate((element) => ({ locale: element.lang, theme: element.getAttribute("data-theme") ?? "light" }));
  const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
  mkdirSync(evidenceDirectory, { recursive: true });
  await page.screenshot({
    path: resolve(evidenceDirectory, `variant-${variant}-${metadata.locale}-${metadata.theme}-${viewport.width}x${viewport.height}-state-${state}.png`),
    animations: "disabled", caret: "hide", style: "nextjs-portal { display: none !important; }",
  });
  if (controlsOpen) {
    await page.keyboard.press("Control+Shift+P");
    await expect(controls).toBeVisible();
  }
}
