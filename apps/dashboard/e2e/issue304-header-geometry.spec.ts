import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { md04FeatureAuthority } from "./support/md04-fixtures";

test.use({ channel: "msedge" });
test.describe.configure({ mode: "serial" });

const evidenceDir = resolve(process.cwd(), "../../docs/validation/issue304-w5");
const evidencePath = join(evidenceDir, "header-geometry-results.json");
const samples: unknown[] = [];

type Box = { x: number; y: number; width: number; height: number; right: number; bottom: number };
type Geometry = {
  viewport: number;
  topbar: Box;
  scope: Box;
  actions: Box;
  controls: { name: string; box: Box; centerUnobscured: boolean }[];
  scrollWidth: number;
  valid: boolean;
  failures: string[];
};

async function measure(page: import("@playwright/test").Page): Promise<Geometry> {
  return page.evaluate(() => {
    const box = (node: Element) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        right: rect.right, bottom: rect.bottom };
    };
    const topbar = document.querySelector(".topbar")!;
    const scope = document.querySelector(".topbar .scope-line")!;
    const actions = document.querySelector(".topbar .topbar-actions")!;
    const header = box(topbar);
    const controls = Array.from(topbar.querySelectorAll("button"))
      .filter((button) => button.getClientRects().length && getComputedStyle(button).visibility !== "hidden")
      .map((button) => {
        const rect = box(button);
        const middle = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return {
          name: button.getAttribute("aria-label") || button.textContent?.trim().slice(0, 35) || "",
          box: rect, centerUnobscured: !!middle && (button === middle || button.contains(middle)),
        };
      });
    const failures: string[] = [];
    const viewport = document.documentElement.clientWidth;
    if (header.x < -1 || header.right > viewport + 1) failures.push("topbar horizontal viewport overflow");
    for (const item of controls) {
      const rect = item.box;
      if (rect.x < -1 || rect.right > viewport + 1) failures.push(item.name + " outside viewport horizontally");
      if (rect.y < header.y - 1 || rect.bottom > header.bottom + 1) failures.push(item.name + " outside topbar vertically");
      if (rect.width < 24 || rect.height < 24) failures.push(item.name + " smaller than 24px");
      if (!item.centerUnobscured) failures.push(item.name + " hit target obscured");
    }
    for (let index = 0; index < controls.length; index++) {
      for (let next = index + 1; next < controls.length; next++) {
        const a = controls[index]!.box;
        const b = controls[next]!.box;
        const overlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x)) *
          Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
        if (overlap > 1) failures.push(controls[index]!.name + "/" + controls[next]!.name + " overlap");
      }
    }
    return { viewport, topbar: header, scope: box(scope), actions: box(actions),
      controls, scrollWidth: document.documentElement.scrollWidth, valid: failures.length === 0, failures };
  });
}

for (const scenario of [
  { width: 320, kind: "mobile" },
  { width: 390, kind: "mobile" },
  { width: 768, kind: "mobile" },
  { width: 1440, kind: "desktop" },
  { width: 384, kind: "zoom200" },
] as const) {
  test("Issue304 production header " + scenario.width + "px " + scenario.kind, async ({ page }) => {
    mkdirSync(evidenceDir, { recursive: true });
    await page.setViewportSize({ width: scenario.width, height: 900 });
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A], companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path, request) => path === "/v1/staff/dashboard/feature-authority"
        ? md04FeatureAuthority(request, "CA") : undefined,
    });
    await fixture.install(page);
    await page.goto("/overview");
    await signInOnCurrentPage(page);
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page.getByRole("button", { name: LOCATION_A.name }).click();
    await expect(page.locator(".topbar")).toBeVisible();

    for (const locale of ["en", "ar"] as const) {
      if (locale === "ar") await page.locator(".topbar-actions > button").first().click();
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      for (const theme of ["light", "dark"] as const) {
        await page.locator(".topbar .theme-segment").nth(theme === "dark" ? 1 : 0).click();
        await page.evaluate(async () => {
          await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
        });
        const baselineStyle = await page.addStyleTag({ content:
          ".topbar {height:4rem !important;flex:0 0 4rem !important;}" });
        const before = await measure(page);
        await baselineStyle.evaluate((node) => node.remove());
        const after = await measure(page);
        samples.push({ width: scenario.width, kind: scenario.kind, locale, theme, before, after });
        if (locale === "ar" && theme === "dark" &&
          [320, 390, 768, 1440].includes(scenario.width)) {
          await page.screenshot({ path: join(evidenceDir,
            "header-" + scenario.width + "-ar-dark-after.png"), animations: "disabled" });
        }
        expect(after.failures, JSON.stringify({ width: scenario.width, locale, theme, after }))
          .toEqual([]);
        if (scenario.kind === "desktop") expect(after.topbar.height).toBeCloseTo(before.topbar.height, 1);
      }
    }
    writeFileSync(evidencePath, JSON.stringify(samples, null, 2) + "\n");
  });
}
