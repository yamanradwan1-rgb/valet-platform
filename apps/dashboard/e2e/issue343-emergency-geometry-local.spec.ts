import { expect, test, type Browser } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
  type FixtureReply,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  ISSUE352_IDS,
  issue352ContextPath,
  issue352TakeoverContext,
} from "./support/issue352-takeover-fixtures";
import { taskItem } from "./support/operations-fixtures";

const baselineUrl = process.env.ISSUE343_BASE_URL ?? "";
const featureUrl = process.env.ISSUE343_FEATURE_URL ?? "";
const outputRoot = resolve(
  process.env.ISSUE343_FREEZE_OUTPUT ?? "../../work/issue-343-ui-freeze",
);
const tasksPath = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview/tasks`;
const variants = [320, 390, 768, 1440].flatMap((width) =>
  (["en", "ar"] as const).flatMap((locale) =>
    (["light", "dark"] as const).map((theme) => ({
      width,
      height: width === 320 ? 768 : width === 390 ? 844 : 900,
      locale,
      theme,
    })),
  ),
);
test.skip(!baselineUrl || !featureUrl, "Requires pinned baseline and feature servers.");
test.setTimeout(12 * 60_000);

function emergencyTask() {
  return taskItem({
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
}

function reply(path: string): FixtureReply | undefined {
  if (path === issue352ContextPath) return { body: issue352TakeoverContext() };
  if (path === tasksPath) return { body: { items: [emergencyTask()], nextCursor: null } };
  return undefined;
}

async function geometry(browser: Browser, baseURL: string, variant: (typeof variants)[number]) {
  const context = await browser.newContext({
    baseURL,
    locale: "en-US",
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
    viewport: { width: variant.width, height: variant.height },
  });
  try {
    const page = await context.newPage();
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path) => reply(path),
    });
    await fixture.install(page);
    await page.goto("/tasks");
    await signInOnCurrentPage(page);
    await page.getByRole("button", { name: ORG_A.name, exact: true }).click();
    await page.getByRole("button", { name: LOCATION_A.name, exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tasks", level: 1 })).toBeVisible();
    if (variant.theme === "dark")
      await page.getByRole("button", { name: "Dark", exact: true }).click();
    if (variant.locale === "ar")
      await page.getByRole("button", { name: "Language", exact: true }).click();
    await page.getByRole("table").getByRole("row").nth(1).getByRole("button").click();
    const drawer = page.getByRole("dialog", {
      name: variant.locale === "ar" ? "التفاصيل" : "Details",
      exact: true,
    });
    await expect(drawer).toBeVisible();
    const action = page.getByTestId("emergency-takeover-open");
    await expect(action).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    return await page.evaluate(() => {
      const rect = (node: Element | null) => {
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      const dialog = document.querySelector(
        '[role="dialog"][aria-label="Details"], [role="dialog"][aria-label="التفاصيل"]',
      );
      const actionNode = dialog?.querySelector('[data-testid="emergency-takeover-open"]') ?? null;
      return {
        action: rect(actionNode),
        actionParent: rect(actionNode?.parentElement ?? null),
        close: rect(
          dialog?.querySelector('button[aria-label="Close"], button[aria-label="إغلاق"]') ?? null,
        ),
        facts: Array.from(dialog?.querySelectorAll("strong") ?? []).map((node) => ({
          label: node.parentElement?.querySelector("span")?.textContent?.trim(),
          value: node.textContent?.trim(),
          rect: rect(node.parentElement),
        })),
      };
    });
  } finally {
    await context.close();
  }
}

test("Issue #343 Emergency Takeover geometry is unchanged in all 16 variants", async ({
  browser,
}) => {
  const records: Array<Record<string, unknown>> = [];
  for (const variant of variants) {
    const baseline = await geometry(browser, baselineUrl, variant);
    const feature = await geometry(browser, featureUrl, variant);
    const match = JSON.stringify(baseline) === JSON.stringify(feature);
    records.push({ variant, baseline, feature, match });
    expect(match, JSON.stringify({ variant, baseline, feature }, null, 2)).toBe(true);
  }
  expect(records).toHaveLength(16);
  const directory = join(outputRoot, "geometry");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "emergency-action-geometry.json"),
    JSON.stringify(
      {
        baselineSha: "92638c499a1062db3f814687ca3761f235361298",
        featureSha: "865b7277883a17fa2fb0f3bbbdb9f59b3098332c",
        browser: { name: "chromium", version: browser.version() },
        renderer: "Next.js 16.4.3 Turbopack",
        exactCases: records.filter((record) => record.match).length,
        totalCases: records.length,
        records,
      },
      null,
      2,
    ),
  );
});
