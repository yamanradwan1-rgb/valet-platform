import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";
import {
  DashboardApiFixture,
  E2E_IDS,
  LOCATION_A,
  ORG_A,
} from "../../../../apps/dashboard/e2e/support/dashboard-api-fixture";
import { signInOnCurrentPage } from "../../../../apps/dashboard/e2e/support/foundation-ui";
import {
  operationsReadReply,
  OP_IDS,
  sessionItem,
} from "../../../../apps/dashboard/e2e/support/operations-fixtures";

const baseline = process.env.ISSUE309_BASELINE_DIR ?? resolve(__dirname, "../../issue-309-prototype/baseline");
const results = process.env.ISSUE309_RESULTS_DIR ?? resolve(__dirname, "results");
const widths = [320, 390, 768, 1440];
const overview = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview`;
const assignee = {
  membershipId: E2E_IDS.membership,
  identity: { firstName: "Lina", lastName: "Haddad", email: "lina@example.com" },
};
const item = sessionItem({
  activeTask: { taskId: OP_IDS.task, assignee },
  keySlot: { resourceId: OP_IDS.keySlot, code: "K-12", label: null },
  parkingZone: { resourceId: OP_IDS.point, code: "Z-1", label: "Garage" },
  parkingSpot: { resourceId: OP_IDS.area, code: "P-4", label: "North" },
  vehicle: {
    vehicleId: OP_IDS.vehicle,
    make: "Toyota",
    model: "Camry",
    color: "Black",
    plateCountry: "JO",
    plateNumberNormalized: "12-34567",
    temporaryDescriptor: null,
  },
});
const live = {
  ...item,
  checkedInBy: { firstName: "Carmen", lastName: "Original" },
  parkedBy: { firstName: "Nora", lastName: "Parker" },
  parkingCompletionProof: "PROVEN",
};

type Rect = { x: number; y: number; width: number; height: number; right: number; bottom: number };
type DrawerMetrics = {
  viewport: { width: number; height: number; devicePixelRatio: number };
  locale: string;
  dir: string;
  theme: string;
  drawer: Rect | null;
  header: Rect | null;
  close: Rect | null;
  body: Rect | null;
  factList: Rect | null;
  rows: { label: string; value: string; rect: Rect | null }[];
  bodyPaddingCss: string | null;
  bodyScroll: { scrollHeight: number; clientHeight: number; scrollTop: number; maxScrollTop: number } | null;
  childrenAfterFacts: number;
  activeElement: string | null;
};

function installFixture(page: Page) {
  return new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === `${overview}/sessions`) return { body: { items: [item], nextCursor: null } };
      if (path === `${overview}/live-sessions`) return { body: { items: [live], nextCursor: null } };
      return operationsReadReply(path);
    },
  }).install(page);
}

async function readMetrics(page: Page): Promise<DrawerMetrics> {
  return page.getByRole("dialog").evaluate((drawer) => {
    const rect = (node: Element | null) => {
      const b = node?.getBoundingClientRect();
      return b ? {
        x: +b.x.toFixed(2), y: +b.y.toFixed(2),
        width: +b.width.toFixed(2), height: +b.height.toFixed(2),
        right: +b.right.toFixed(2), bottom: +b.bottom.toFixed(2),
      } : null;
    };
    const header = drawer.children.item(0);
    const body = drawer.children.item(1) as HTMLElement | null;
    const facts = body?.children.item(0);
    const rows = Array.from(facts?.children ?? [], (row) => ({
      label: row.children.item(0)?.textContent?.trim() ?? "",
      value: row.children.item(1)?.textContent?.trim() ?? "",
      rect: rect(row),
    }));
    // W1's frozen `close` metric captures first aria-label button (Help).
    // Match its historical selector; header pixels cover actual Close too.
    const close = drawer.querySelector("button[aria-label]");
    return {
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio, zoom: document.documentElement.style.zoom || "none" },
      dir: document.documentElement.dir,
      locale: document.documentElement.lang,
      theme: document.documentElement.dataset.theme ?? "",
      drawer: rect(drawer), header: rect(header), close: rect(close),
      body: rect(body), factList: rect(facts), rows,
      bodyPaddingCss: body ? getComputedStyle(body).padding : null,
      bodyScroll: body ? {
        scrollHeight: body.scrollHeight, clientHeight: body.clientHeight,
        scrollTop: body.scrollTop,
        maxScrollTop: Math.max(0, body.scrollHeight - body.clientHeight),
      } : null,
      childrenAfterFacts: Math.max(0, (body?.children.length ?? 0) - 1),
      activeElement: document.activeElement?.getAttribute("aria-label") ?? null,
    };
  });
}

function checkFrozen(source: DrawerMetrics, actual: DrawerMetrics, key: string) {
  expect(actual.viewport, `${key} viewport`).toEqual(source.viewport);
  expect(actual.locale, `${key} locale`).toBe(source.locale);
  expect(actual.dir, `${key} direction`).toBe(source.dir);
  expect(actual.theme, `${key} theme`).toBe(source.theme);
  for (const part of ["drawer", "header", "close", "factList"] as const) {
    // Pixel equivalence is checked separately; zero-tolerance geometry prevents
    // an added photo element silently changing the original drawer surface.
    expect(actual[part], `${key} ${part} bounding box`).toEqual(source[part]);
  }
  expect(actual.bodyPaddingCss, `${key} scroll container padding`).toEqual(source.bodyPaddingCss);
  expect(actual.rows, `${key} original FactList labels, values and row geometry`).toEqual(source.rows);
  expect(actual.activeElement, `${key} initial Close focus`).toEqual(source.activeElement);
}

test.beforeAll(() => {
  for (const surface of ["vehicles", "live-operations"]) {
    if (!existsSync(resolve(baseline, `${surface}-metrics.json`))) {
      throw new Error(`Real original React baseline missing: ${baseline}. Set ISSUE309_BASELINE_DIR.`);
    }
  }
  mkdirSync(results, { recursive: true });
});

for (const surface of ["vehicles", "live-operations"] as const) {
  test(`${surface}: 16 actual React frozen configurations`, async ({ page }) => {
    const errors: string[] = [];
    const measured: { key: string; top: DrawerMetrics }[] = [];
    const baselineData = JSON.parse(readFileSync(resolve(baseline, `${surface}-metrics.json`), "utf8"));
    const originals = new Map<string, DrawerMetrics>(baselineData.cases.map(
      (entry: { key: string; top: DrawerMetrics }) => [entry.key, entry.top],
    ));
    page.on("pageerror", (error) => errors.push(error.message));
    await installFixture(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${surface}`);
    await signInOnCurrentPage(page);
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page.getByRole("button", { name: LOCATION_A.name }).click();
    await expect(page.getByRole("table").getByText("Toyota Camry", { exact: true })).toBeVisible();

    for (const state of [
      { locale: "en", theme: "light", transition: "none" },
      { locale: "en", theme: "dark", transition: "dark" },
      { locale: "ar", theme: "dark", transition: "language" },
      { locale: "ar", theme: "light", transition: "light" },
    ] as const) {
      if (state.transition === "dark") await page.getByRole("button", { name: "Dark" }).click();
      if (state.transition === "language") await page.getByRole("button", { name: "Language" }).click();
      if (state.transition === "light") await page.getByRole("button", { name: "فاتح" }).click();
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        // Keep mouse away from the responsive sidebar. The historical W1
        // captures drift by ~40 pixels in individual nav rows with hovered
        // buttons; both actual source and candidate use this same position.
        await page.mouse.move(Math.max(width - 4, 4), 898);
        await page.evaluate(() => document.fonts.ready);
        const key = `${surface}-${state.locale}-${state.theme}-${width}`;
        await page.screenshot({ path: resolve(results, `${key}-closed.png`), animations: "disabled" });
        const trigger = page.getByRole("table").getByRole("button", { name: /Details|التفاصيل/u }).first();
        await trigger.click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("button", { name: /Close|إغلاق/u })).toBeFocused();
        // Mirror W1's original screenshot capture: fonts settle *after* the
        // drawer mounts so deferred font substitution cannot taint parity.
        await page.evaluate(() => document.fonts.ready);
        const actual = await readMetrics(page);
        const original = originals.get(key);
        expect(original, `missing original metrics for ${key}`).toBeDefined();
        checkFrozen(original!, actual, key);
        measured.push({ key, top: actual });
        await page.screenshot({ path: resolve(results, `${key}-top.png`), animations: "disabled" });
        // Unlike the baseline, candidate body scrollHeight may grow because
        // photos belong *after* the FactList. Existing rows must still fit.
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
      }
    }
    writeFileSync(resolve(results, `${surface}-candidate.json`), JSON.stringify({
      baselineSha: "459e9c42dfff5b2aeb11ee9165a7d1a4338a7783",
      source: "actual integrated Next.js React with synthetic authorized E2E fixtures",
      cases: measured, browserErrors: errors,
    }, null, 2));
    expect(measured).toHaveLength(16);
    expect(errors).toEqual([]);
  });
}
