import { chromium, open, evidence } from "./browser-support.mjs";
import { screenshots } from "./matrix.mjs";
const browser = await chromium.launch({ headless: false });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("dialog", (dialog) => dialog.accept());
  await open(page);
  await screenshots(page);
  await page.setViewportSize({ width: 1440, height: 1900 });
  await open(page, "locale=en&theme=light&scope=location&section=zones");
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  await page.getByLabel("Code", { exact: true }).fill("DEMO-NORTH");
  await page.getByLabel("Zone label", { exact: true }).fill("Demo north entry");
  await page.getByRole("button", { name: "Move point →", exact: true }).click();
  await page.getByLabel("Radius (meters)", { exact: true }).fill("95");
  await page.locator(".content").evaluate((el) => (el.scrollTop = 0));
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
  await page.screenshot({
    path: `${evidence}/attendance-zone-edit.png`,
    fullPage: true,
  });
  console.log("Finished-state captures complete.");
} finally {
  await browser.close();
}
