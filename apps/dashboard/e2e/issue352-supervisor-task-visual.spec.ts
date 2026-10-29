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
import {
  ISSUE352_IDS,
  issue352ContextPath,
  issue352TakeoverContext,
} from "./support/issue352-takeover-fixtures";
import { taskItem } from "./support/operations-fixtures";

const baseURL = process.env.ISSUE352_PINNED_BASE_URL ?? "";
const expectedSha = process.env.ISSUE352_EXPECTED_SOURCE_SHA ?? "";
const tasksPath = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview/tasks`;
const viewports = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 768 },
] as const;

const activeTask = taskItem({
  taskId: ISSUE352_IDS.task,
  taskType: "RETRIEVAL",
  status: "IN_PROGRESS",
  valetSessionId: ISSUE352_IDS.session,
  currentAssigneeMembershipId: ISSUE352_IDS.actorA,
  assignee: {
    membershipId: ISSUE352_IDS.actorA,
    identity: {
      firstName: "Sami",
      lastName: "Retriever",
      email: "sami@example.test",
    },
  },
});

test("issue352 Supervisor exact-Shift mounted Tasks drawer/modal keeps EN/AR focus and geometry", async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  test.skip(!baseURL || !expectedSha, "Requires pinned integrated Dashboard");
  const sourceRoot = resolve(process.cwd(), "../..");
  const actualSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: sourceRoot,
    encoding: "utf8",
  }).trim();
  expect(actualSha).toBe(expectedSha);
  const evidenceRoot =
    process.env.ISSUE352_EVIDENCE_DIR ?? testInfo.outputPath("evidence");
  const directory = join(evidenceRoot, "after", "supervisor", "tasks");
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
      override: (path) =>
        path === tasksPath
          ? { body: { items: [activeTask], nextCursor: null } }
          : path === issue352ContextPath
            ? { body: issue352TakeoverContext() }
            : undefined,
    });
    await fixture.install(page);
    await page.goto("/maps-zones");
    await signInOnCurrentPage(page, "supervisor@example.com");
    await page
      .getByRole("button", { name: `${ORG_A.name} · ${LOCATION_A.name}` })
      .click();
    if (viewport.width <= 390) {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }
    await page
      .getByRole("navigation", { name: "Management navigation" })
      .getByRole("link", { name: "Tasks" })
      .click();
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();

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
      const heading = variant.locale === "ar" ? "المهام" : "Tasks";
      await expect(
        page.getByRole("heading", { name: heading, level: 1 }),
      ).toBeVisible();
      const table = page.getByRole("table");
      await expect(table.getByRole("row")).toHaveCount(2);
      await expect(table).toContainText("Sami Retriever");
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(0, 0);
      const suffix = `${variant.locale}-${variant.theme}-${viewport.width}x${viewport.height}`;
      const screenshot = async (kind: string) =>
        page.screenshot({
          path: join(directory, `${kind}-${suffix}.png`),
          animations: "disabled" as const,
          caret: "hide" as const,
          fullPage: true,
          style: "nextjs-portal { display: none !important; }",
        });
      await screenshot("list");
      const opener = table.getByRole("row").nth(1).getByRole("button");
      await opener.focus();
      await page.keyboard.press("Enter");
      const drawer = page.getByRole("dialog", {
        name: variant.locale === "ar" ? "التفاصيل" : "Details",
      });
      await expect(drawer).toBeVisible();
      const action = drawer.getByTestId("emergency-takeover-open");
      await expect(action).toBeVisible();
      await screenshot("drawer");
      const drawerBounds = await drawer.boundingBox();
      await action.focus();
      await page.keyboard.press("Enter");
      const modal = page.getByRole("dialog", {
        name: variant.locale === "ar" ? "نقل طارئ" : "Emergency Takeover",
      });
      await expect(modal).toBeVisible();
      await expect(
        modal.getByTestId("emergency-takeover-confirm"),
      ).toBeDisabled();
      await screenshot("modal");
      const modalBounds = await modal.boundingBox();
      const search = modal.getByTestId("emergency-takeover-search");
      await search.focus();
      await page.keyboard.press("Shift+Tab");
      await expect(
        modal.getByRole("button", {
          name: variant.locale === "ar" ? "إلغاء" : "Cancel",
        }),
      ).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(search).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(modal).toHaveCount(0);
      await expect(action).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(0);
      await expect(opener).toBeFocused();
      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      expect(scrollWidth).toBeLessThanOrEqual(viewport.width);
      expect(modalBounds?.width).toBeLessThanOrEqual(viewport.width);
      captures.push({
        role: "VALET_SUPERVISOR",
        locationId: LOCATION_A.locationId,
        locale: variant.locale,
        theme: variant.theme,
        viewport,
        drawerBounds,
        modalBounds,
        scrollWidth,
      });
    }
    expect(fixture.count(tasksPath)).toBeGreaterThan(0);
    expect(fixture.count(issue352ContextPath)).toBeGreaterThan(0);
    await context.close();
  }
  expect(captures).toHaveLength(12);
  writeFileSync(
    join(evidenceRoot, "after", "tasks-manifest.json"),
    JSON.stringify(
      {
        sourceSha: actualSha,
        baseURL,
        browser: "chromium",
        screenshotCount: captures.length * 3,
        captures,
      },
      null,
      2,
    ),
  );
});
