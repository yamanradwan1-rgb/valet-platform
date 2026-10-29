import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  issue352ContextPath,
  issue352TakeoverContext,
} from "./support/issue352-takeover-fixtures";
import { taskItem } from "./support/operations-fixtures";

const tasksPath = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview/tasks`;
const sourceRoot = resolve(process.cwd(), "../..");
const baseURL = process.env.ISSUE352_PINNED_BASE_URL ?? "";
const expectedSha = process.env.ISSUE352_EXPECTED_SOURCE_SHA ?? "";
const phase = process.env.ISSUE352_EVIDENCE_PHASE ?? "candidate";
const eligibleContext = process.env.ISSUE352_CONTEXT_MODE === "eligible";
const hideNextDevIndicator = "nextjs-portal { display: none !important; }";
const viewports = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 768 },
] as const;

const taskRows = [
  taskItem({
    taskId: "77777777-7777-4777-8777-777777777721",
    taskType: "PARKING",
    currentAssigneeMembershipId: "55555555-5555-4555-8555-555555555555",
    assignee: {
      membershipId: "55555555-5555-4555-8555-555555555555",
      identity: {
        firstName: "Nora",
        lastName: "Parker",
        email: "nora@example.test",
      },
    },
  }),
  taskItem({
    taskId: "77777777-7777-4777-8777-777777777722",
    taskType: "RETRIEVAL",
    currentAssigneeMembershipId: "55555555-5555-4555-8555-555555555556",
    assignee: {
      membershipId: "55555555-5555-4555-8555-555555555556",
      identity: {
        firstName: "Sami",
        lastName: "Retriever",
        email: "sami@example.test",
      },
    },
  }),
];

test("issue352 mounted Task Details preserves baseline in EN/AR, light/dark, 320/390/1440", async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  test.skip(
    !baseURL || !expectedSha,
    "Requires explicit pinned source and server",
  );
  const actualSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: sourceRoot,
    encoding: "utf8",
  }).trim();
  expect(actualSha).toBe(expectedSha);

  const evidenceRoot =
    process.env.ISSUE352_EVIDENCE_DIR ?? testInfo.outputPath("evidence");
  const directory = join(evidenceRoot, phase, "company-admin", "tasks");
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
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path) =>
        path === tasksPath
          ? { body: { items: taskRows, nextCursor: null } }
          : path === issue352ContextPath && eligibleContext
            ? { body: issue352TakeoverContext() }
            : undefined,
    });
    await fixture.install(page);
    await page.goto("/tasks");
    await signInOnCurrentPage(page);
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page.getByRole("button", { name: LOCATION_A.name }).click();

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
      await expect(
        page.getByRole("heading", {
          name: variant.locale === "ar" ? "المهام" : "Tasks",
          level: 1,
        }),
      ).toBeVisible();
      const table = page.getByRole("table");
      await expect(table.getByRole("row")).toHaveCount(3);
      await expect(table).toContainText("Sami Retriever");
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(0, 0);

      const suffix = `${variant.locale}-${variant.theme}-${viewport.width}x${viewport.height}`;
      await page.screenshot({
        path: join(directory, `list-${suffix}.png`),
        animations: "disabled",
        caret: "hide",
        fullPage: true,
        style: hideNextDevIndicator,
      });

      const opener = table.getByRole("row").nth(2).getByRole("button");
      await opener.scrollIntoViewIfNeeded();
      await opener.focus();
      await page.keyboard.press("Enter");
      const drawer = page.getByRole("dialog", {
        name: variant.locale === "ar" ? "التفاصيل" : "Details",
      });
      await expect(drawer).toBeVisible();
      const action = drawer.getByTestId("emergency-takeover-open");
      if (eligibleContext) await expect(action).toBeVisible();
      else await expect(action).toHaveCount(0);
      await expect(
        drawer.getByRole("button", {
          name: variant.locale === "ar" ? "إغلاق" : "Close",
        }),
      ).toBeFocused();
      await page.screenshot({
        path: join(directory, `drawer-${suffix}.png`),
        animations: "disabled",
        caret: "hide",
        fullPage: true,
        style: hideNextDevIndicator,
      });
      const drawerBounds = await drawer.boundingBox();
      let modalBounds = null;
      let modalReturnFocus = null;
      if (eligibleContext) {
        await action.focus();
        await page.keyboard.press("Enter");
        const modal = page.getByRole("dialog", {
          name: variant.locale === "ar" ? "نقل طارئ" : "Emergency Takeover",
        });
        await expect(modal).toBeVisible();
        await expect(
          modal.getByTestId("emergency-takeover-candidate"),
        ).toBeVisible();
        await expect(
          modal.getByTestId("emergency-takeover-confirm"),
        ).toBeDisabled();
        await expect
          .poll(() =>
            page.evaluate(() =>
              document.activeElement
                ?.closest('[role="dialog"]')
                ?.getAttribute("aria-label"),
            ),
          )
          .toBe(variant.locale === "ar" ? "نقل طارئ" : "Emergency Takeover");
        await page.screenshot({
          path: join(directory, `modal-${suffix}.png`),
          animations: "disabled",
          caret: "hide",
          fullPage: true,
          style: hideNextDevIndicator,
        });
        modalBounds = await modal.boundingBox();
        const search = modal.getByTestId("emergency-takeover-search");
        await search.focus();
        await expect(search).toBeFocused();
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
        modalReturnFocus = await page.evaluate(() => ({
          tag: document.activeElement?.tagName,
          label: document.activeElement?.getAttribute("aria-label"),
          testId: document.activeElement?.getAttribute("data-testid"),
          text: document.activeElement?.textContent?.trim().slice(0, 80),
        }));
        await expect(drawer).toBeVisible();
      }
      await page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(0);
      await expect(opener).toBeFocused();
      captures.push({
        role: "COMPANY_ADMIN",
        locationId: LOCATION_A.locationId,
        route: "/tasks",
        locale: variant.locale,
        theme: variant.theme,
        viewport,
        documentScrollWidth: await page.evaluate(
          () => document.documentElement.scrollWidth,
        ),
        drawerBounds,
        modalBounds,
        modalReturnFocus,
      });
    }
    expect(fixture.count(tasksPath)).toBeGreaterThan(0);
    await context.close();
  }

  writeFileSync(
    join(evidenceRoot, phase, "manifest.json"),
    JSON.stringify(
      {
        sourceSha: actualSha,
        baseURL,
        phase,
        browser: "chromium",
        fixture: "issue352-pinned-company-admin-task-list-v1",
        eligibleContext,
        screenshotCount: captures.length * (eligibleContext ? 3 : 2),
        captures,
      },
      null,
      2,
    ),
  );
  expect(captures).toHaveLength(12);
});
