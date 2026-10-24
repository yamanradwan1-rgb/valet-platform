import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { fixture, session } from "../issues-312-317-318/fixture.mjs";
import { createFrozenGuestCapture } from "./browser-freeze-capture.mjs";

const require = createRequire(
  new URL("../../../dashboard/package.json", import.meta.url),
);
const { chromium } = require("@playwright/test");
const phase = process.argv[2] || "before";
const zoom = process.env.QA_ZOOM === "200";
const target = process.env.TARGET_URL || "http://127.0.0.1:3314";
const output = resolve(process.env.QA_EVIDENCE || ".qa335-evidence");
const root = join(output, zoom ? "freeze200" : "freeze100");
const directory = join(root, phase);
const widths = process.env.QA_WIDTH?.split(",").map(Number) || [
  320, 390, 768, 1440,
];
const locales = process.env.QA_LOCALE?.split(",") || ["en", "ar"];
const themes = process.env.QA_THEME?.split(",") || ["light", "dark"];
const cases = [];
const errors = [];
await mkdir(directory, { recursive: true });
const screenshot = createFrozenGuestCapture({
  zoom,
  phase,
  root,
  directory,
  cases,
});

const { control, server } = await fixture();
let browser = null;
let persistent = null;
try {
  if (zoom) {
    const extension = join(output, "issue-335-native-zoom-extension");
    await mkdir(extension, { recursive: true });
    await writeFile(
      join(extension, "manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        name: "Issue 335 native 200 percent QA",
        version: "1.0",
        permissions: ["tabs"],
        background: { service_worker: "background.js" },
      }),
    );
    await writeFile(
      join(extension, "background.js"),
      `chrome.tabs.onUpdated.addListener((id, change, tab) => {
        if (tab.url?.startsWith('${target}')) chrome.tabs.setZoom(id, 2);
      });`,
    );
    persistent = await chromium.launchPersistentContext(
      join(output, `issue335-profile-${phase}`),
      {
        headless: false,
        channel: "chromium",
        viewport: { width: 390, height: 900 },
        reducedMotion: "reduce",
        serviceWorkers: "block",
        args: [
          `--disable-extensions-except=${extension}`,
          `--load-extension=${extension}`,
        ],
      },
    );
  } else {
    browser = await chromium.launch({ headless: false });
  }

  for (const width of widths) {
    for (const locale of locales) {
      for (const theme of themes) {
        const context =
          persistent ||
          (await browser.newContext({
            viewport: { width, height: 900 },
            deviceScaleFactor: 1,
            reducedMotion: "reduce",
            serviceWorkers: "block",
          }));
        const page = persistent
          ? context.pages()[0] || (await context.newPage())
          : await context.newPage();
        page.on("pageerror", (error) =>
          errors.push(`${width}/${locale}/${theme}: ${error.message}`),
        );
        await page.clock.setFixedTime(new Date("2026-10-22T12:00:00.000Z"));
        await page.setViewportSize({ width, height: 900 });
        control.failure = null;
        control.state = "PARKED";
        await page.goto(target);
        await page.evaluate(
          ({ locale, theme }) => {
            localStorage.setItem("vaylet_guest_locale", locale);
            localStorage.setItem("vaylet_guest_theme", theme);
          },
          { locale, theme },
        );
        await page.reload();
        for (const [state, name] of [
          ["PARKED", "vehicle"],
          ["READY", "ready"],
        ]) {
          control.state = state;
          await page.goto(target);
          await page.getByText("Toyota", { exact: false }).first().waitFor();
          await screenshot(page, `${width}-${locale}-${theme}-${name}`);
        }
        control.failure = "GUEST_ACCESS_INVALID";
        await page.goto(target);
        await page
          .getByText(
            locale === "en"
              ? "Valet session unavailable"
              : "خدمة الاصطفاف غير متاحة",
            { exact: false },
          )
          .first()
          .waitFor();
        await screenshot(page, `${width}-${locale}-${theme}-unavailable`);

        control.failure = "SERVICE_UNAVAILABLE";
        await page.goto(target);
        await page.locator("main button").last().waitFor();
        await screenshot(page, `${width}-${locale}-${theme}-network`);

        control.failure = null;
        await page.route("**/api/v1/guest/session", async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              ...session("PARKED"),
              readyAt: null,
              guestVehicleReadyNotificationEnabled: true,
            }),
          });
        });
        await page.route("**/api/v1/guest/push/config", async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              enabled: true,
              publicKey: "BEl6N3N1hXlJ2HtQ8LrT7t75cQ",
            }),
          });
        });
        await page.goto(target);
        await page
          .getByText(
            locale === "en"
              ? "Vehicle-ready notifications"
              : "إشعارات جاهزية المركبة",
            { exact: false },
          )
          .first()
          .waitFor();
        await screenshot(page, `${width}-${locale}-${theme}-push-card`);
        if (process.env.QA_KEYBOARD === "1") {
          const buttons = page.locator('section[aria-live="polite"] button');
          if ((await buttons.count()) !== 2)
            throw new Error("Push card has no two keyboard actions.");
          await buttons.nth(0).focus();
          if (
            !(await buttons
              .nth(0)
              .evaluate((element) => element === document.activeElement))
          ) {
            throw new Error("Enable action did not receive keyboard focus.");
          }
          await page.keyboard.press("Tab");
          if (
            !(await buttons
              .nth(1)
              .evaluate((element) => element === document.activeElement))
          ) {
            throw new Error("Tab did not reach Not now action.");
          }
          await page.keyboard.press("Shift+Tab");
          if (
            !(await buttons
              .nth(0)
              .evaluate((element) => element === document.activeElement))
          ) {
            throw new Error("Reverse Tab did not reach Enable action.");
          }
        }
        await page.unroute("**/api/v1/guest/session");
        await page.unroute("**/api/v1/guest/push/config");
        if (persistent) page.removeAllListeners("pageerror");
        if (!persistent) await context.close();
      }
    }
  }
} catch (error) {
  errors.push(String(error));
} finally {
  const resultName = `${phase}${process.env.QA_KEYBOARD === "1" ? "-keyboard" : ""}-results.json`;
  await writeFile(
    join(root, resultName),
    JSON.stringify(
      {
        phase,
        target,
        zoom,
        cases,
        errors,
        differences: cases.filter(
          (item) => item.pixelEqual === false || item.domEqual === false,
        ),
      },
      null,
      2,
    ),
  );
  await browser?.close();
  await persistent?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}

const differences = cases.filter(
  (item) => item.pixelEqual === false || item.domEqual === false,
);
console.log(
  JSON.stringify(
    {
      phase,
      zoom,
      captured: cases.length,
      identical: cases.filter((item) => item.pixelEqual && item.domEqual)
        .length,
      differences: differences.length,
      errors,
    },
    null,
    2,
  ),
);
if (
  errors.length ||
  differences.length ||
  cases.length !== widths.length * locales.length * themes.length * 5
)
  process.exitCode = 1;
