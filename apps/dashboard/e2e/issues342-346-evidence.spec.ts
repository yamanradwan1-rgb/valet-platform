import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  setVisualPreferences,
  visualCash,
  visualLocation,
  visualPresence,
} from "./support/issues342-346-visual";

const output = resolve("../../work/affected-evidence");
test.skip(
  process.env.ISSUES_UI_EVIDENCE !== "1",
  "Opt-in evidence capture requires separate base-SHA and feature previews.",
);
for (const locale of ["en", "ar"] as const) {
  test(`affected areas before/after ${locale}`, async ({ browser }) => {
    test.setTimeout(120_000);
    mkdirSync(output, { recursive: true });
    for (const baseline of [true, false]) {
      for (const surface of ["location", "presence", "cash"] as const) {
        const context = await browser.newContext({
          baseURL: baseline ? "http://localhost:3004" : "http://localhost:3003",
          viewport: { width: locale === "en" ? 390 : 1440, height: 900 },
        });
        const page = await context.newPage();
        try {
          if (surface === "location") await visualLocation(page);
          else if (surface === "presence") await visualPresence(page);
          else await visualCash(page, baseline);
          await setVisualPreferences(
            page,
            locale,
            locale === "en" ? "light" : "dark",
            1,
          );
          await page.addStyleTag({
            content: "nextjs-portal { display: none !important; }",
          });
          const target =
            surface === "location"
              ? page.locator("fieldset").first()
              : page.getByRole("dialog");
          await expect(target).toBeVisible();
          await target.screenshot({
            path: resolve(
              output,
              `${surface}-${locale}-${baseline ? "before" : "after"}.png`,
            ),
            animations: "disabled",
          });
        } finally {
          await context.close();
        }
      }
    }
  });
}
