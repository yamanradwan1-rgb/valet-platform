import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { md04AuditReply } from "./support/md04-audit-fixtures";
import { md04FeatureAuthority } from "./support/md04-fixtures";

const evidence = join(process.cwd(), "test-results", "issue300-concept-a-ui");
const views = [
  { name: "en-light-1440", width: 1440, locale: "en", dark: false, zoom: false },
  { name: "en-dark-1440", width: 1440, locale: "en", dark: true, zoom: false },
  { name: "ar-dark-1440", width: 1440, locale: "ar", dark: true, zoom: false },
  { name: "en-light-768", width: 768, locale: "en", dark: false, zoom: false },
  { name: "en-light-390", width: 390, locale: "en", dark: false, zoom: false },
  { name: "ar-dark-320", width: 320, locale: "ar", dark: true, zoom: false },
  { name: "ar-effective200-384", width: 384, locale: "ar", dark: true, zoom: false },
  { name: "en-effective200-720", width: 720, locale: "en", dark: false, zoom: false },
  { name: "en-zoom2-1440", width: 1440, locale: "en", dark: false, zoom: true },
  { name: "ar-zoom2-768", width: 768, locale: "ar", dark: true, zoom: true },
] as const;

function auditRequests(fixture: DashboardApiFixture) {
  return Array.from(fixture.counts.entries())
    .filter(([url]) => url.endsWith("/audit-events"))
    .reduce((total, [, count]) => total + count, 0);
}

async function setup(page: Page) {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => path === "/v1/staff/dashboard/feature-authority"
      ? md04FeatureAuthority(request, "CA")
      : md04AuditReply(path, request, "CA"),
  });
  await fixture.install(page);
  await page.goto("/audit-log?investigationDemo=1");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByRole("tab", { name: "Investigation Search" }))
    .toHaveAttribute("aria-selected", "true");
  return fixture;
}

async function screenshot(page: Page, name: string) {
  mkdirSync(evidence, { recursive: true });
  console.log("Issue #300 local visual evidence:", evidence);
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: join(evidence, name + ".png"),
    animations: "disabled",
  });
}

for (const state of views) {
  test("Issue #300 integrated A " + state.name, async ({ page }) => {
    await page.setViewportSize({ width: state.width, height: 900 });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const fixture = await setup(page);
    expect(auditRequests(fixture)).toBe(0);

    await page.getByRole("button", { name: /Apply search/i }).click();
    const sessions = page.locator('button[aria-pressed][class*="sessionChoice"]');
    await expect(sessions).toHaveCount(3);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelectorAll("main").forEach((node) => { node.scrollTop = 0; });
    });
    await screenshot(page, state.name + "-initial");
    await sessions.nth(1).click();
    await expect(sessions.nth(1)).toHaveAttribute("aria-pressed", "true");
    await sessions.nth(2).click();
    await expect(sessions.nth(2)).toHaveAttribute("aria-pressed", "true");
    const incident = page.getByRole("button", { name: /INC-304/ });
    await incident.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(incident).toBeFocused();

    if (state.dark) {
      await page.getByRole("group", { name: "Theme" })
        .getByRole("button").nth(1).click();
    }
    if (state.locale === "ar") {
      await page.getByRole("button", { name: "Language", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    }
    if (state.zoom) {
      await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    }
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.scrollingElement?.scrollTo(0, 0);
      document.querySelectorAll("main").forEach((element) => {
        element.scrollTop = 0;
        element.scrollLeft = 0;
      });
    });
    if (state.zoom) {
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve())));
      });
      const diagnostic = await page.evaluate(() => ({
        scrollTop: document.scrollingElement?.scrollTop,
        scrollLeft: document.scrollingElement?.scrollLeft,
        body: document.body.getBoundingClientRect().toJSON(),
        main: document.querySelector("main")?.getBoundingClientRect().toJSON(),
        shell: document.querySelector('[class*="shell"]')?.getBoundingClientRect().toJSON(),
        aside: document.querySelector("aside")?.getBoundingClientRect().toJSON(),
        header: document.querySelector("header")?.getBoundingClientRect().toJSON(),
        title: document.querySelector("h1")?.getBoundingClientRect().toJSON(),
        target: (() => {
          const node = document.elementFromPoint(window.innerWidth - 100, 180);
          return node ? { tag: node.tagName, text: node.textContent?.slice(0, 70) } : null;
        })(),
      }));
      console.log("Issue300 zoom geometry", state.name, JSON.stringify(diagnostic));
    }
    await screenshot(page, state.name);
    const geom = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      width: window.innerWidth,
      heading: getComputedStyle(document.querySelector("h1")!).fontSize,
    }));
    // CSS zoom scales scrollWidth itself; the effective content width must
    // remain inside the scaled viewport. Browser zoom also gets separate
    // coverage from our 768px responsive case.
    expect(geom.document).toBeLessThanOrEqual(geom.width * (state.zoom ? 2 : 1));
    expect(geom.heading).toBe("24px");
    expect(pageErrors).toEqual([]);
    expect(auditRequests(fixture)).toBe(0);

    if (state.locale === "en" && state.width === 1440 && !state.zoom) {
      await page.getByRole("tab", { name: "Audit Events" }).click();
      await expect(page.getByRole("table")).toBeVisible();
      expect(auditRequests(fixture)).toBeGreaterThan(0);
      await screenshot(page, state.name + "-audit-events");
      await page.getByRole("table").getByRole("button").first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await screenshot(page, state.name + "-audit-drawer");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  });
}
