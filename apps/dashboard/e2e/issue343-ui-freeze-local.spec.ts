import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
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
const outputRoot = resolve(process.env.ISSUE343_FREEZE_OUTPUT ?? "../../work/issue-343-ui-freeze");
const hideDevUi = "nextjs-portal { display: none !important; }";
const tasksPath = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview/tasks`;
const sourceSha = {
  baseline: "92638c499a1062db3f814687ca3761f235361298",
  feature: "865b7277883a17fa2fb0f3bbbdb9f59b3098332c",
} as const;
const viewports = [
  { width: 320, height: 768 },
  { width: 390, height: 844 },
  { width: 768, height: 900 },
  { width: 1440, height: 900 },
] as const;
const reps = [
  { width: 1440, height: 900, locale: "ar", theme: "dark" },
  { width: 320, height: 768, locale: "en", theme: "light" },
  { width: 390, height: 844, locale: "ar", theme: "dark" },
  { width: 768, height: 900, locale: "en", theme: "dark" },
] as const;
type Target = keyof typeof sourceSha;
type Locale = "en" | "ar";
type Theme = "light" | "dark";
type State = "normal" | "emergency" | "empty" | "loading" | "error";
type Variant = { width: number; height: number; locale: Locale; theme: Theme };

test.skip(!baselineUrl || !featureUrl, "Requires pinned baseline and feature servers.");
test.setTimeout(20 * 60_000);

function completedTask() {
  return taskItem({
    taskId: "77777777-7777-4777-8777-777777777721",
    taskType: "PARKING",
    status: "COMPLETED",
    currentAssigneeMembershipId: ISSUE352_IDS.actorA,
    assignee: {
      membershipId: ISSUE352_IDS.actorA,
      identity: { firstName: "Sami", lastName: "Retriever", email: "sami@example.test" },
    },
  });
}

function emergencyTask() {
  return taskItem({
    taskId: ISSUE352_IDS.task,
    taskType: "RETRIEVAL",
    status: "IN_PROGRESS",
    valetSessionId: ISSUE352_IDS.session,
    currentAssigneeMembershipId: ISSUE352_IDS.actorA,
    assignee: {
      membershipId: ISSUE352_IDS.actorA,
      identity: { firstName: "Sami", lastName: "Retriever", email: "sami@example.test" },
    },
  });
}

function replyFor(state: State, path: string): FixtureReply | undefined {
  if (path === issue352ContextPath && state === "emergency") return { body: issue352TakeoverContext() };
  if (path !== tasksPath) return undefined;
  if (state === "loading") return { delayMs: 8_000, body: { items: [completedTask()], nextCursor: null } };
  if (state === "error") return { status: 503, body: { code: "UNAVAILABLE", message: "Unavailable", requestId: "issue343-freeze" } };
  if (state === "empty") return { body: { items: [], nextCursor: null } };
  return { body: { items: [state === "emergency" ? emergencyTask() : completedTask()], nextCursor: null } };
}

async function setupPage(browser: Browser, baseURL: string, variant: Variant, state: State) {
  const context = await browser.newContext({
    baseURL,
    locale: "en-US",
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
    viewport: { width: variant.width, height: variant.height },
  });
  const page = await context.newPage();
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => replyFor(state, path),
  });
  await fixture.install(page);
  await page.goto("/tasks");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name, exact: true }).click();
  await page.getByRole("button", { name: LOCATION_A.name, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tasks", level: 1 })).toBeVisible();
  if (variant.theme === "dark") await page.getByRole("button", { name: "Dark", exact: true }).click();
  if (variant.locale === "ar") await page.getByRole("button", { name: "Language", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", variant.locale === "ar" ? "rtl" : "ltr");
  await expect(page.locator("html")).toHaveAttribute("data-theme", variant.theme);
  return { context, page };
}

async function ready(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

async function frozenGeometry(page: Page) {
  return page.evaluate(() => {
    const rect = (node: Element | null) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const table = document.querySelector("table");
    const dialog = document.querySelector('[role="dialog"][aria-label="Details"], [role="dialog"][aria-label="التفاصيل"]');
    return {
      sidebar: rect(document.querySelector(".sidebar")),
      topbar: rect(document.querySelector(".topbar")),
      table: rect(table),
      headerCells: Array.from(table?.querySelectorAll("thead th") ?? []).map((node) => ({ text: node.textContent?.trim(), rect: rect(node) })),
      rowCells: Array.from(table?.querySelectorAll("tbody tr:first-child td") ?? []).map((node) => ({ text: node.textContent?.trim(), rect: rect(node) })),
      drawer: rect(dialog),
      close: rect(dialog?.querySelector('button[aria-label="Close"], button[aria-label="إغلاق"]') ?? null),
      facts: Array.from(dialog?.querySelectorAll("strong") ?? []).map((node) => ({
        label: node.parentElement?.querySelector("span")?.textContent?.trim(),
        value: node.textContent?.trim(),
        rect: rect(node.parentElement),
      })),
      emergencyAction: rect(dialog?.querySelector('[data-testid="emergency-takeover-open"]') ?? null),
      scroll: { x: window.scrollX, y: window.scrollY },
    };
  });
}

function subtractRectangle(
  source: { x1: number; y1: number; x2: number; y2: number },
  excluded: { x1: number; y1: number; x2: number; y2: number },
) {
  const x1 = Math.max(source.x1, excluded.x1);
  const y1 = Math.max(source.y1, excluded.y1);
  const x2 = Math.min(source.x2, excluded.x2);
  const y2 = Math.min(source.y2, excluded.y2);
  if (x1 >= x2 || y1 >= y2) return [source];
  return [
    { x1: source.x1, y1: source.y1, x2: source.x2, y2: y1 },
    { x1: source.x1, y1: y2, x2: source.x2, y2: source.y2 },
    { x1: source.x1, y1, x2: x1, y2 },
    { x1: x2, y1, x2: source.x2, y2 },
  ].filter((rect) => rect.x1 < rect.x2 && rect.y1 < rect.y2);
}

async function routeMask(page: Page, exclude: Locator | null = null) {
  const section = page.getByTestId("task-route-history-section");
  if ((await section.count()) === 0) return null;
  const box = await section.boundingBox();
  if (!box) return null;
  const viewport = page.viewportSize()!;
  const x1 = Math.max(0, Math.floor(box.x));
  const y1 = Math.max(0, Math.floor(box.y));
  const x2 = Math.min(viewport.width, Math.ceil(box.x + box.width));
  const y2 = Math.min(viewport.height, Math.ceil(box.y + box.height));
  if (x2 <= x1 || y2 <= y1) return { css: box, pixels: [], excludedDialogPixels: null };
  const source = { x1, y1, x2, y2 };
  const excludedBox = exclude ? await exclude.boundingBox() : null;
  if (!excludedBox)
    return { css: box, pixels: [source], excludedDialogPixels: null };
  const excludedDialogPixels = {
    x1: Math.max(0, Math.floor(excludedBox.x)),
    y1: Math.max(0, Math.floor(excludedBox.y)),
    x2: Math.min(viewport.width, Math.ceil(excludedBox.x + excludedBox.width)),
    y2: Math.min(viewport.height, Math.ceil(excludedBox.y + excludedBox.height)),
  };
  return {
    css: box,
    pixels: subtractRectangle(source, excludedDialogPixels),
    excludedDialogPixels,
  };
}

async function snap(page: Page, target: Target, id: string, mask: Awaited<ReturnType<typeof routeMask>>) {
  await page.evaluate(() => document.fonts.ready);
  const dir = join(outputRoot, target);
  mkdirSync(dir, { recursive: true });
  const primary = join(dir, `${id}.png`);
  const repeat = join(dir, `${id}-repeat.png`);
  const options = { animations: "disabled" as const, caret: "hide" as const, fullPage: true, style: hideDevUi };
  await page.screenshot({ path: primary, ...options });
  await page.waitForTimeout(50);
  await page.screenshot({ path: repeat, ...options });
  return {
    id,
    primary,
    repeat,
    mask,
    geometry: await frozenGeometry(page),
    runtime: await page.evaluate(() => ({
      dpr: devicePixelRatio,
      dir: document.documentElement.dir,
      theme: document.documentElement.dataset.theme,
      fontStatus: document.fonts.status,
      bodyFont: getComputedStyle(document.body).fontFamily,
    })),
  };
}

async function normalCase(browser: Browser, target: Target, baseURL: string, variant: Variant) {
  const { context, page } = await setupPage(browser, baseURL, variant, "normal");
  try {
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
    await ready(page);
    const suffix = `${variant.width}-${variant.locale}-${variant.theme}`;
    const list = await snap(page, target, `list-${suffix}`, null);
    await page.getByRole("table").getByRole("row").nth(1).getByRole("button").click();
    const drawer = page.getByRole("dialog", { name: variant.locale === "ar" ? "التفاصيل" : "Details", exact: true });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("button", { name: variant.locale === "ar" ? "إغلاق" : "Close", exact: true })).toBeFocused();
    const mask = await routeMask(page);
    const details = await snap(page, target, `details-${suffix}`, mask);
    return [list, details];
  } finally {
    await context.close();
  }
}

async function extraCase(browser: Browser, target: Target, baseURL: string, variant: Variant, state: Exclude<State, "normal">) {
  const { context, page } = await setupPage(browser, baseURL, variant, state);
  try {
    const suffix = `${variant.width}-${variant.locale}-${variant.theme}`;
    if (state === "emergency") {
      await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
      await page.getByRole("table").getByRole("row").nth(1).getByRole("button").click();
      const action = page.getByTestId("emergency-takeover-open");
      await expect(action).toBeVisible();
      await action.click();
      const emergencyDialog = page.getByRole("dialog", {
        name: variant.locale === "ar" ? "نقل طارئ" : "Emergency Takeover",
        exact: true,
      });
      await expect(emergencyDialog).toBeVisible();
      const mask = await routeMask(page, emergencyDialog);
      return await snap(page, target, `emergency-${suffix}`, mask);
    }
    const expected = state === "loading"
      ? variant.locale === "ar" ? "جارٍ التحميل…" : "Loading…"
      : state === "empty"
        ? variant.locale === "ar" ? "لا توجد بيانات حالية متاحة." : "No current data is available."
        : "Unavailable";
    await expect(page.locator("tbody")).toContainText(expected);
    await ready(page);
    return await snap(page, target, `${state}-${suffix}`, null);
  } finally {
    await context.close();
  }
}

test("Issue #343 strict same-render 48-pair UI freeze capture", async ({ browser }) => {
  const captures: Record<Target, unknown[]> = { baseline: [], feature: [] };
  for (const viewport of viewports) for (const locale of ["en", "ar"] as const) for (const theme of ["light", "dark"] as const) {
    const variant = { ...viewport, locale, theme };
    for (const [target, baseURL] of [["baseline", baselineUrl], ["feature", featureUrl]] as const)
      captures[target].push(...await normalCase(browser, target, baseURL, variant));
  }
  for (const variant of reps) for (const state of ["emergency", "empty", "loading", "error"] as const)
    for (const [target, baseURL] of [["baseline", baselineUrl], ["feature", featureUrl]] as const)
      captures[target].push(await extraCase(browser, target, baseURL, variant, state));
  for (const target of ["baseline", "feature"] as const) {
    expect(captures[target]).toHaveLength(48);
    writeFileSync(join(outputRoot, target, "manifest.json"), JSON.stringify({
      target,
      sourceSha: sourceSha[target],
      baseURL: target === "baseline" ? baselineUrl : featureUrl,
      browser: { name: "chromium", version: browser.version() },
      renderer: "Next.js 16.4.3 Turbopack",
      screenshot: { fullPage: true, animations: "disabled", caret: "hide", deviceScaleFactor: 1 },
      captures: captures[target],
    }, null, 2));
  }
});
