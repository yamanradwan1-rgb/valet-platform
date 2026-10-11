import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { operationsReadReply, sessionItem } from "./support/operations-fixtures";
import { locationIntelligenceReply } from "./support/md05-intelligence-fixtures";
import { contextHelpRegistry, type ContextHelpKey } from "../src/features/help/context-help-registry";

const root = resolve(process.cwd(), "../../tmp/issue-278-c-u004-remediation-evidence");
const phase = process.env.ISSUE278_U004_CAPTURE_PHASE ?? "repair";
const scopes = {
  "/overview": ["overview.period"],
  "/payments": ["payments.period", "payments.breakdown"],
  "/analytics": ["analytics.period", "analytics.activity", "analytics.durations"],
  "/maps-zones": ["maps.mode"],
  "/live-operations": ["live.sessions"],
  "/vehicles": ["vehicles.table"],
  "/tasks": ["tasks.filters", "tasks.table"],
  "/incidents": ["incidents.list"],
} as const satisfies Record<string, readonly ContextHelpKey[]>;
const variants = [
  { name: "en-light-1440", locale: "en", dark: false, width: 1440 },
  { name: "ar-dark-390", locale: "ar", dark: true, width: 390 },
  { name: "en-dark-390", locale: "en", dark: true, width: 390 },
  { name: "ar-light-320", locale: "ar", dark: false, width: 320 },
  { name: "en-light-320", locale: "en", dark: false, width: 320 },
  { name: "en-light-effective-200pct", locale: "en", dark: false, width: 720 },
  { name: "ar-light-1440", locale: "ar", dark: false, width: 1440 },
] as const;

async function setup(page: Page, route: string) {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => path.endsWith("/overview/live-sessions")
      ? { body: { items: [{ ...sessionItem(), checkedInBy: null, parkedBy: null,
        parkingCompletionProof: "NO_RECORD" }], nextCursor: null } }
      : operationsReadReply(path) ?? locationIntelligenceReply(path, request),
  });
  await fixture.install(page);
  await page.goto(route);
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  return fixture;
}

for (const [route, keys] of Object.entries(scopes)) {
  test("U004 visible and nonoverlapping Help " + route, async ({ page }) => {
    const fixture = await setup(page, route);
    for (const variant of variants) {
      await page.setViewportSize({ width: variant.width, height: 760 });
      const currentLocale = await page.locator("html").getAttribute("lang");
      if (currentLocale === "ar") await page.getByRole("button", { name: "اللغة" }).click();
      await page.getByRole("group", { name: "Theme" }).locator("button")
        .nth(variant.dark ? 1 : 0).click();
      if (variant.locale === "ar") await page.getByRole("button", { name: "Language" }).click();
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
      await page.evaluate(() => {
        document.querySelector("main")?.scrollTo(0, 0);
        window.scrollTo(0, 0);
      });
      const before = [...fixture.counts.entries()].sort();
      const targets: Record<string, unknown> = {};
      for (const key of phase === "repair" ? keys : []) {
        const name = (variant.locale === "ar" ? "مساعدة: " : "Help: ") +
          contextHelpRegistry[key][variant.locale].title;
        const button = page.getByRole("button", { name, exact: true });
        await expect(button).toHaveCount(1);
        const state = await button.evaluate((element: HTMLButtonElement) => {
          const rect = element.getBoundingClientRect();
          const clip = { left: 0, right: innerWidth };
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent);
            if (/auto|scroll|hidden|clip/u.test(style.overflowX)) {
              const p = parent.getBoundingClientRect();
              clip.left = Math.max(clip.left, p.left);
              clip.right = Math.min(clip.right, p.right);
            }
          }
          const controls = Array.from(document.querySelectorAll("main button,main input,main select"))
            .filter((item) => item !== element && getComputedStyle(item).display !== "none");
          const collision = controls.filter((item) => {
            const b = item.getBoundingClientRect();
            let left = Math.max(0, b.left);
            let right = Math.min(innerWidth, b.right);
            for (let parent = item.parentElement; parent; parent = parent.parentElement) {
              const style = getComputedStyle(parent);
              if (/auto|scroll|hidden|clip/u.test(style.overflowX)) {
                const bounds = parent.getBoundingClientRect();
                left = Math.max(left, bounds.left);
                right = Math.min(right, bounds.right);
              }
            }
            return left < right && left < rect.right && rect.left < right &&
              b.top < rect.bottom && rect.top < b.bottom;
          }).map((item) => item.getAttribute("aria-label") || item.textContent?.trim().slice(0, 30));
          const text = Array.from(document.querySelectorAll(
            "main h1,main h2,main [class*='scopeNote'],main [class*='levelControl']," +
            "main [class*='incidentContext'] > span",
          )).filter((item) => !item.contains(element));
          const textCollision = text.filter((item) => {
            const range = document.createRange();
            range.selectNodeContents(item);
            return Array.from(range.getClientRects()).some((b) =>
              b.left < rect.right && rect.left < b.right &&
              b.top < rect.bottom && rect.top < b.bottom);
          }).map((item) => item.textContent?.trim().slice(0, 40));
          const covered = rect.top >= 0 && rect.bottom <= innerHeight
            ? !element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
            : null;
          const liveGroup = element.closest('[class*="liveFilterRow"]')
            ?.querySelector('[class*="liveFilterTabs"]');
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
            initialX: rect.left >= 0 && rect.right <= innerWidth,
            clippedX: rect.left < clip.left - 0.5 || rect.right > clip.right + 0.5,
            collision, textCollision, covered,
            liveGroup: liveGroup ? { rect: liveGroup.getBoundingClientRect().toJSON(),
              overflowX: getComputedStyle(liveGroup).overflowX,
              scrollWidth: liveGroup.scrollWidth,
              clientWidth: liveGroup.clientWidth } : null };
        });
        targets[key] = state;
        expect(state.width).toBeGreaterThanOrEqual(24);
        expect(state.height).toBeGreaterThanOrEqual(24);
        expect(state.initialX, route + " " + key + " " + variant.name + JSON.stringify(state)).toBe(true);
        expect(state.clippedX, route + " " + key + " " + variant.name + JSON.stringify(state)).toBe(false);
        expect(state.collision, route + " " + key + " " + variant.name + JSON.stringify(state)).toHaveLength(0);
        expect(state.textCollision, route + " " + key + " " + variant.name + JSON.stringify(state)).toHaveLength(0);
        if (state.covered !== null) {
          expect(state.covered, route + " " + key + " " + variant.name +
            JSON.stringify(state)).toBe(false);
        }
        if (variant.width === 390) {
          await button.focus();
          if (variant.locale === "ar") await button.click();
          else await page.keyboard.press("Enter");
          await expect(page.getByRole("dialog", {
            name: contextHelpRegistry[key][variant.locale].title,
          })).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog", {
            name: contextHelpRegistry[key][variant.locale].title,
          })).toHaveCount(0);
          await expect(button).toBeFocused();
          await page.evaluate(() => {
            document.querySelector("main")?.scrollTo(0, 0);
            window.scrollTo(0, 0);
          });
        }
      }
      expect([...fixture.counts.entries()].sort()).toEqual(before);
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        document.querySelector("main")?.scrollTo(0, 0);
        window.scrollTo(0, 0);
      });
      const folder = join(root, phase, route.slice(1), variant.name);
      mkdirSync(folder, { recursive: true });
      await page.screenshot({ path: join(folder, "page.png"), fullPage: true, animations: "disabled" });
      const geometry = await page.evaluate(() => ({
        scrollY,
        h1: [...document.querySelectorAll("main h1")].map((el) => el.getBoundingClientRect().toJSON()),
        tables: [...document.querySelectorAll("main table")].map((el) => el.getBoundingClientRect().toJSON()),
        charts: [...document.querySelectorAll('[data-testid="analytics-chart-panel"]')].map((el) => el.getBoundingClientRect().toJSON()),
        toolbar: [...document.querySelectorAll('[data-testid="map-reference-toolbar"]')].map((el) => el.getBoundingClientRect().toJSON()),
      }));
      writeFileSync(join(folder, "geometry.json"), JSON.stringify({ route, variant, targets, geometry }, null, 2));
    }
  });
}
