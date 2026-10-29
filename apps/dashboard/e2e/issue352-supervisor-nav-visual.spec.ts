import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
  supervisorContext,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

const baseURL = process.env.ISSUE352_PINNED_BASE_URL ?? "";
const expectedSha = process.env.ISSUE352_EXPECTED_SOURCE_SHA ?? "";
const phase = process.env.ISSUE352_SUPERVISOR_NAV_PHASE ?? "before";
const baseline = phase.startsWith("before");
const viewports = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 768 },
] as const;

test("issue352 Supervisor Tasks navigation remains a narrowly additive visual change", async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  test.skip(!baseURL || !expectedSha, "Requires a pinned mounted Dashboard");
  const sourceRoot = resolve(process.cwd(), "../..");
  const actualSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: sourceRoot,
    encoding: "utf8",
  }).trim();
  expect(actualSha).toBe(expectedSha);
  const evidenceRoot =
    process.env.ISSUE352_EVIDENCE_DIR ?? testInfo.outputPath("evidence");
  const directory = join(evidenceRoot, phase, "supervisor", "navigation");
  mkdirSync(directory, { recursive: true });
  const captures: Array<Record<string, unknown>> = [];

  for (const viewport of viewports) {
    const context = await browser.newContext({
      baseURL,
      locale: "en-US",
      viewport,
    });
    const page = await context.newPage();
    const fixture = new DashboardApiFixture({
      operationalContexts: [supervisorContext()],
    });
    await fixture.install(page);
    await page.goto("/maps-zones");
    await signInOnCurrentPage(page, "supervisor@example.com");
    await page
      .getByRole("button", { name: `${ORG_A.name} · ${LOCATION_A.name}` })
      .click();
    await expect(
      page.getByRole("heading", { name: "Maps & Zones" }),
    ).toBeVisible();

    for (const [index, variant] of [
      { locale: "en", theme: "light" },
      { locale: "en", theme: "dark" },
      { locale: "ar", theme: "dark" },
      { locale: "ar", theme: "light" },
    ].entries()) {
      if (index === 1) await page.getByRole("button", { name: "Dark" }).click();
      if (index === 2)
        await page.getByRole("button", { name: "Language" }).click();
      if (index === 3) await page.getByRole("button", { name: "فاتح" }).click();
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        variant.locale === "ar" ? "rtl" : "ltr",
      );
      const nav = page.getByRole("navigation", {
        name:
          variant.locale === "ar" ? "تنقل الإدارة" : "Management navigation",
      });
      const tasksLink = nav.getByRole("link", {
        name: variant.locale === "ar" ? "المهام" : "Tasks",
      });
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(0, 0);
      const suffix = `${variant.locale}-${variant.theme}-${viewport.width}x${viewport.height}`;
      await page.screenshot({
        path: join(directory, `nav-${suffix}.png`),
        animations: "disabled",
        caret: "hide",
        fullPage: true,
        style: "nextjs-portal { display: none !important; }",
      });
      if (viewport.width <= 390) {
        await page
          .getByRole("button", {
            name: variant.locale === "ar" ? "فتح التنقل" : "Open navigation",
          })
          .click();
      }
      if (baseline) await expect(tasksLink).toHaveCount(0);
      else await expect(tasksLink).toBeVisible();
      const authorizedLinks =
        variant.locale === "ar"
          ? ["المهام", "الخرائط والمناطق", "الأمان", "المساعدة"]
          : ["Tasks", "Maps & Zones", "Security", "Help"];
      await expect(nav.getByRole("link")).toHaveText(
        baseline ? authorizedLinks.slice(1) : authorizedLinks,
      );
      for (const forbidden of ["Administration", "Analytics", "Reports"]) {
        await expect(nav.getByRole("link", { name: forbidden })).toHaveCount(0);
      }
      const mobileNavigationLinks =
        viewport.width <= 390
          ? await nav.getByRole("link").allTextContents()
          : null;
      if (viewport.width <= 390) {
        await page.screenshot({
          path: join(directory, `mobile-open-${suffix}.png`),
          animations: "disabled",
          caret: "hide",
          fullPage: true,
          style: "nextjs-portal { display: none !important; }",
        });
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
      }
      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      expect(scrollWidth).toBeLessThanOrEqual(viewport.width);
      captures.push({
        locale: variant.locale,
        theme: variant.theme,
        viewport,
        role: "VALET_SUPERVISOR",
        locationId: LOCATION_A.locationId,
        links: await nav.getByRole("link").allTextContents(),
        mobileNavigationLinks,
        scrollWidth,
      });
    }
    await context.close();
  }
  expect(captures).toHaveLength(12);
  writeFileSync(
    join(evidenceRoot, phase, "manifest.json"),
    JSON.stringify(
      {
        sourceSha: actualSha,
        baseURL,
        phase,
        browser: "chromium",
        screenshotCount:
          captures.length +
          captures.filter(
            (item) => (item.viewport as { width: number }).width <= 390,
          ).length,
        captures,
      },
      null,
      2,
    ),
  );
});
