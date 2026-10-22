import { createRequire } from "node:module";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fixture } from "./fixture.mjs";

const require = createRequire(
  new URL("../../../dashboard/package.json", import.meta.url),
);
const { chromium } = require("@playwright/test");
const phase = process.argv[2] || "before";
const evidence = resolve(process.env.QA_EVIDENCE || "qa-evidence");
const target = process.env.TARGET_URL || "http://127.0.0.1:3312";
const extension = join(evidence, "native-zoom-matrix-extension");
await mkdir(extension, { recursive: true });
await writeFile(
  join(extension, "manifest.json"),
  JSON.stringify({
    manifest_version: 3,
    name: "Isolated native zoom QA",
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
const { server, control } = await fixture();
const context = await chromium.launchPersistentContext(
  join(evidence, `matrix-profile-${phase}`),
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
  await page.clock.setFixedTime(new Date("2026-10-22T12:00:00.000Z"));
  for (const width of [320, 390, 768, 1440])
    for (const locale of ["en", "ar"])
      for (const theme of ["light", "dark"]) {
        control.state = "PARKED";
        control.failure = null;
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
        const rate = locale === "en" ? "Rate your experience" : "قيّم تجربتك";
        const back = locale === "en" ? "Back" : "رجوع";
        const summary = locale === "en" ? "Payment summary" : "ملخص الدفع";
        async function capture(screen) {
          await page.waitForFunction(
            () =>
              devicePixelRatio === 2 &&
              document
                .getAnimations()
                .every(
                  (a) =>
                    a.effect?.getTiming().iterations === Infinity ||
                    a.playState === "finished",
                ),
          );
          await page.evaluate(async () => {
            const fonts = new Set(
              [...document.querySelectorAll("header *, main *")].map((el) => {
                const s = getComputedStyle(el);
                return `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
              }),
            );
            await Promise.all(
              [...fonts].map((font) => document.fonts.load(font)),
            );
            await document.fonts.ready;
            window.scrollTo(0, 0);
            document.querySelector("main")?.scrollTo(0, 0);
            for (const a of document.getAnimations())
              if (a.effect?.getTiming().iterations === Infinity) {
                a.pause();
                a.currentTime = 0;
              }
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
          });
          const name = `${width}-${locale}-${theme}-${screen}-native200`;
          const dom = await page.evaluate(() => {
            const root = document.querySelector("header")?.parentElement;
            return {
              html: root?.outerHTML,
              elements: [...(root?.querySelectorAll("*") || [])].map((el) => {
                const box = el.getBoundingClientRect(),
                  style = getComputedStyle(el);
                return {
                  tag: el.tagName,
                  box: [box.x, box.y, box.width, box.height],
                  style: Object.fromEntries(
                    [...style]
                      .sort()
                      .map((k) => [k, style.getPropertyValue(k)]),
                  ),
                };
              }),
            };
          });
          await writeFile(
            join(evidence, phase, `${name}.json`),
            JSON.stringify(dom),
          );
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
        for (const [state, name] of [
          ["PARKED", "vehicle"],
          ["REQUESTED", "request"],
          ["RETRIEVING", "retrieval"],
          ["READY", "ready"],
          ["HANDOFF_PENDING", "pin"],
        ]) {
          control.state = state;
          await page.goto(target);
          await page.getByText("Toyota", { exact: false }).first().waitFor();
          if (state === "HANDOFF_PENDING")
            await page.getByRole("button", { name: /QR/ }).first().waitFor();
          await capture(name);
          if (state === "HANDOFF_PENDING") {
            await page.getByRole("button", { name: /QR/ }).first().click();
            await page.locator('main svg[role="img"][aria-label]').waitFor();
            await capture("qr");
          }
        }
        control.state = "COMPLETED";
        await page.goto(target);
        if (phase === "before")
          await page.getByRole("button", { name: rate, exact: true }).click();
        await page.getByRole("group", { name: rate }).waitFor();
        await capture("rating");
        await page.getByRole("button", { name: back, exact: true }).click();
        await page
          .getByRole("button", { name: summary, exact: true })
          .waitFor();
        await capture("completed");
        await page.getByRole("button", { name: summary, exact: true }).click();
        await page.getByRole("button", { name: back, exact: true }).waitFor();
        await capture("payment");
        await page.getByRole("button", { name: back, exact: true }).click();
        await page.locator("header button").last().click();
        await page.getByRole("dialog").waitFor();
        await capture("more");
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
        await capture("unavailable");
        control.failure = "SERVICE_UNAVAILABLE";
        await page.goto(target);
        await page.locator("main button").last().waitFor();
        await capture("network");
      }
} finally {
  await writeFile(
    join(evidence, `${phase}-native200.json`),
    JSON.stringify(results, null, 2),
  );
  await context.close();
  await new Promise((resolve) => server.close(resolve));
}
