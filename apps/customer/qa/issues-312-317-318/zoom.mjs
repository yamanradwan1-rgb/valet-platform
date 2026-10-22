import { createRequire } from "node:module";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fixture } from "./fixture.mjs";

const require = createRequire(
  new URL("../../../dashboard/package.json", import.meta.url),
);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "@playwright/test");
const phase = process.argv[2] || "before";
const evidence = resolve(process.env.QA_EVIDENCE || "qa-evidence");
const target = process.env.TARGET_URL || "http://127.0.0.1:3312";
const extension = join(evidence, "native-zoom-extension");
await mkdir(extension, { recursive: true });
await writeFile(
  join(extension, "manifest.json"),
  JSON.stringify({
    manifest_version: 3,
    name: "Isolated QA native browser zoom",
    version: "1.0",
    permissions: ["tabs"],
    background: { service_worker: "background.js" },
  }),
);
await writeFile(
  join(extension, "background.js"),
  `chrome.tabs.onUpdated.addListener((id, change, tab) => {
    if(tab.url?.startsWith('${target}')) chrome.tabs.setZoom(id, 2);
  });`,
);
const { server } = await fixture();
const context = await chromium.launchPersistentContext(
  join(evidence, `zoom-profile-${phase}`),
  {
    headless: false,
    channel: "chromium",
    viewport: { width: 390, height: 900 },
    deviceScaleFactor: 1,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
    timezoneId: "Asia/Amman",
    serviceWorkers: "block",
    reducedMotion: "reduce",
  },
);
const results = [];
try {
  const page = context.pages()[0] || (await context.newPage());
  for (const width of [320, 390, 768, 1440])
    for (const locale of ["en", "ar"])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(target);
        await page.evaluate(
          ({ locale, theme }) => {
            localStorage.clear();
            sessionStorage.clear();
            localStorage.setItem("vaylet_guest_locale", locale);
            localStorage.setItem("vaylet_guest_theme", theme);
          },
          { locale, theme },
        );
        await page.reload();
        await page.waitForFunction(() => window.devicePixelRatio === 2);
        const rate = locale === "en" ? "Rate your experience" : "قيّم تجربتك";
        if (phase === "before")
          await page.getByRole("button", { name: rate, exact: true }).click();
        await page.getByRole("group", { name: rate }).waitFor();
        for (const screen of ["rating", "more"]) {
          if (screen === "more") {
            await page.locator("header button").last().click();
            await page.getByRole("dialog").waitFor();
          }
          await page.evaluate(async () => {
            await document.fonts.ready;
            document.getAnimations().forEach((a) => {
              if (a.effect?.getTiming().iterations !== Infinity) {
                a.finish();
                a.pause();
              }
            });
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
          });
          const name = `${width}-${locale}-${theme}-${screen}-native200`;
          const shot = await page.screenshot({
            path: join(evidence, phase, `${name}.png`),
            animations: "allow",
            fullPage: true,
          });
          const measurement = await page.evaluate(() => ({
            dpr: devicePixelRatio,
            width: innerWidth,
            cssZoom: getComputedStyle(document.documentElement).zoom,
          }));
          results.push({
            name,
            measurement,
            pixelEqual:
              phase === "after"
                ? (
                    await readFile(join(evidence, "before", `${name}.png`))
                  ).equals(shot)
                : null,
          });
        }
      }
} finally {
  await writeFile(
    join(evidence, `${phase}-native200.json`),
    JSON.stringify(results, null, 2),
  );
  await context.close();
  await new Promise((resolve) => server.close(resolve));
}
