import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  frozenGeometry,
  setVisualPreferences,
  visualCash,
  visualLocation,
  visualPresence,
} from "./support/issues342-346-visual";

const baseline = process.env.ISSUES_UI_BASELINE === "1";
test.skip(
  !baseline && process.env.ISSUES_UI_FREEZE !== "1",
  "Opt-in comparison requires a separately running base-SHA preview and captured baselines.",
);
const output = resolve(process.env.ISSUES_UI_OUTPUT ?? "../../work/ui-freeze");
for (const locale of ["en", "ar"] as const)
  for (const theme of ["light", "dark"] as const)
    for (const width of [320, 390, 768, 1440])
      for (const zoom of [1, 2]) {
        test(`UI freeze ${locale}/${theme}/${width}/${zoom * 100}%`, async ({
          browser,
          baseURL,
        }) => {
          test.setTimeout(120_000);
          const variant = `${locale}-${theme}-${width}-${zoom * 100}`;
          mkdirSync(output, { recursive: true });
          for (const surface of ["presence", "location", "cash"] as const) {
            const context = await browser.newContext({
              baseURL: baseURL ?? "http://localhost:3003",
              viewport: { width, height: 900 },
            });
            const page = await context.newPage();
            try {
              if (surface === "presence") await visualPresence(page);
              else if (surface === "location") await visualLocation(page);
              else await visualCash(page, baseline);
              await setVisualPreferences(page, locale, theme, zoom);
              const frozen = await frozenGeometry(page);
              expect(
                frozen.filter((node) => node.selector === ".sidebar"),
              ).toHaveLength(1);
              expect(
                frozen.filter((node) => node.selector === ".topbar"),
              ).toHaveLength(1);
              const name = `${surface}-${variant}`;
              if (baseline)
                writeFileSync(
                  resolve(output, `${name}-baseline.json`),
                  JSON.stringify(frozen),
                );
              else
                expect(frozen).toEqual(
                  JSON.parse(
                    readFileSync(
                      resolve(output, `${name}-baseline.json`),
                      "utf8",
                    ),
                  ),
                );
              await page.screenshot({
                path: resolve(
                  output,
                  `${name}-${baseline ? "before" : "after"}.png`,
                ),
                animations: "disabled",
                fullPage: true,
              });
              if (!baseline) {
                if (surface === "presence")
                  await expect(page.getByRole("dialog")).toContainText(
                    locale === "ar"
                      ? "آخر منطقة حضور"
                      : "last active attendance zone",
                  );
                if (surface === "cash") {
                  const section = page.getByRole("region", {
                    name:
                      locale === "ar" ? "تسوية النقد" : "Cash Reconciliation",
                  });
                  await expect(section).toContainText("12.345");
                  await section.screenshot({
                    path: resolve(output, `${name}-facts.png`),
                  });
                }
                if (surface === "location") {
                  const action = page.getByRole("button", {
                    name:
                      locale === "ar"
                        ? "إعادة فتح استقبال السيارات"
                        : "Resume Intake",
                    exact: true,
                  });
                  await action.focus();
                  await page.keyboard.press("Enter");
                  const dialog = page.getByRole("dialog");
                  await expect(dialog).toBeVisible();
                  await page.keyboard.press("Tab");
                  expect(
                    await dialog.evaluate((node) =>
                      node.contains(document.activeElement),
                    ),
                  ).toBe(true);
                  await page.screenshot({
                    path: resolve(output, `${name}-confirmation.png`),
                    animations: "disabled",
                  });
                  await page.keyboard.press("Escape");
                  await expect(dialog).toHaveCount(0);
                }
              }
            } finally {
              await context.close();
            }
          }
        });
      }
