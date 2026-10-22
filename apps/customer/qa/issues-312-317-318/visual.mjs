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
const extra = process.env.QA_EXTRA === "1";
const { server, control } = await fixture();
const browser = await chromium.launch({ headless: false });
const results = [];
await mkdir(join(evidence, phase), { recursive: true });
try {
  for (const width of process.env.QA_WIDTH
    ? [Number(process.env.QA_WIDTH)]
    : [320, 390, 768, 1440])
    for (const locale of process.env.QA_LOCALE
      ? [process.env.QA_LOCALE]
      : ["en", "ar"])
      for (const theme of process.env.QA_THEME
        ? [process.env.QA_THEME]
        : ["light", "dark"]) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          deviceScaleFactor: 1,
          timezoneId: "Asia/Amman",
          reducedMotion: "reduce",
          serviceWorkers: "block",
        });
        await context.addInitScript(
          ({ locale, theme }) => {
            localStorage.setItem("vaylet_guest_locale", locale);
            localStorage.setItem("vaylet_guest_theme", theme);
          },
          { locale, theme },
        );
        const page = await context.newPage();
        if (extra)
          await page.clock.setFixedTime(new Date("2026-10-22T12:00:00.000Z"));
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const rate = locale === "en" ? "Rate your experience" : "قيّم تجربتك";
        const back = locale === "en" ? "Back" : "رجوع";
        const summary = locale === "en" ? "Payment summary" : "ملخص الدفع";
        async function capture(screen) {
          await page.waitForFunction(() =>
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
            document.getAnimations().forEach((a) => {
              if (a.effect?.getTiming().iterations === Infinity) {
                a.pause();
                a.currentTime = 0;
              }
            });
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
          });
          await page.waitForFunction(() => document.fonts.status === "loaded");
          const name = `${width}-${locale}-${theme}-${screen}`;
          const dom = await page.evaluate(() => {
            const root = document.querySelector("header")?.parentElement;
            return {
              html: root?.outerHTML,
              elements: [...(root?.querySelectorAll("*") || [])].map((el) => {
                const box = el.getBoundingClientRect();
                const style = getComputedStyle(el);
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
          const shot = await page.screenshot({
            path: join(evidence, phase, `${name}.png`),
            fullPage: true,
            animations: "allow",
          });
          await writeFile(
            join(evidence, phase, `${name}.json`),
            JSON.stringify(dom),
          );
          let parity = null;
          if (phase === "after") {
            const old = await readFile(
              join(evidence, "before", `${name}.json`),
              "utf8",
            );
            const png = await readFile(join(evidence, "before", `${name}.png`));
            parity = {
              domStylesBoxes: old === JSON.stringify(dom),
              pngBytesEqual: png.equals(shot),
            };
          }
          results.push({
            name,
            parity,
            errors: [...errors],
            posts: control.ratingPosts,
          });
        }
        for (const [state, name, text] of extra
          ? [["HANDOFF_PENDING", "pin", "Toyota"]]
          : [
              ["PARKED", "vehicle", "Toyota"],
              ["REQUESTED", "request", "Toyota"],
              ["RETRIEVING", "retrieval", "Toyota"],
              ["READY", "ready", "Toyota"],
            ]) {
          control.state = state;
          await page.goto(target);
          await page.getByText(text, { exact: false }).first().waitFor();
          if (extra)
            await page
              .getByRole("button", { name: locale === "en" ? /QR/ : /QR/ })
              .first()
              .waitFor();
          await capture(name);
          if (extra) {
            await page.getByRole("button", { name: /QR/ }).first().click();
            await page
              .locator('main canvas, main img, main svg[role="img"]')
              .first()
              .waitFor()
              .catch(() => {});
            await capture("qr");
          }
        }
        if (extra) {
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
          control.failure = null;
          await context.close();
          continue;
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
        await page
          .getByText(locale === "en" ? "No payment is recorded" : "لا توجد", {
            exact: false,
          })
          .first()
          .waitFor({ timeout: 1000 })
          .catch(() => {});
        await page.getByRole("button", { name: back, exact: true }).waitFor();
        await capture("payment");
        await page.getByRole("button", { name: back, exact: true }).click();
        await page.locator("header button").last().click();
        await page.getByRole("dialog").waitFor();
        await capture("more");
        await context.close();
      }
} finally {
  await writeFile(
    join(evidence, `${phase}${extra ? "-extra" : ""}-results.json`),
    JSON.stringify(
      {
        browser: browser.version(),
        target,
        phase,
        results,
        evidenceLevel:
          "Production build + synthetic HTTP fixture; not live API authorization",
      },
      null,
      2,
    ),
  );
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
