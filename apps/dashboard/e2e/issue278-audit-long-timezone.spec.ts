import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { contextHelpRegistry } from "../src/features/help/context-help-registry";
import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { md04AuditReply } from "./support/md04-audit-fixtures";
import { md04FeatureAuthority } from "./support/md04-fixtures";

const timezone = "America/Argentina/Buenos_Aires";
const longZoneLocation = { ...LOCATION_A, timezone };

test("Audit table Help does not cover a real Location's long timezone label", async ({ page }) => {
  const writes: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [longZoneLocation] },
    override: (path, request) => {
      if (request.method() !== "GET" && !path.startsWith("/v1/staff/auth/")) writes.push(path);
      return path === "/v1/staff/dashboard/feature-authority"
        ? md04FeatureAuthority(request, "CA") : md04AuditReply(path, request, "CA");
    },
  });
  await fixture.install(page);
  await page.goto("/audit-log");
  await signInOnCurrentPage(page, "admin@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByText("Location Audit", { exact: true })).toBeVisible();
  const zone = page.locator("main table thead bdi");
  await expect(zone).toHaveText(timezone);
  await expect(page.getByText("Loaded 1 events", { exact: true })).toBeVisible();
  const cdp = await page.context().newCDPSession(page);

  const cases = [
    { width: 1440, locale: "en", zoom: false },
    { width: 320, locale: "en", zoom: false },
    { width: 390, locale: "ar", zoom: false },
    { width: 768, locale: "ar", zoom: true },
    { width: 768, locale: "ar", zoom: "native" },
  ] as const;
  for (const item of cases) {
    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
    await page.setViewportSize({ width: item.width, height: 900 });
    const current = await page.locator("html").getAttribute("lang");
    if (current !== item.locale) await page.getByRole("button", { name: current === "ar" ? "اللغة" : "Language" }).click();
    await page.evaluate((zoom) => { document.documentElement.style.zoom = zoom === true ? "200%" : ""; }, item.zoom);
    if (item.zoom === "native") await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
    const entry = contextHelpRegistry["audit.table"][item.locale];
    const help = page.getByRole("button", {
      name: `${item.locale === "ar" ? "مساعدة: " : "Help: "}${entry.title}`, exact: true,
    });
    await expect(help).toBeVisible();
    const rect = await help.boundingBox();
    expect(rect).not.toBeNull();
    const overlaps = await zone.evaluate((element, box) => {
      const node = element.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) return null;
      const range = document.createRange();
      range.selectNodeContents(node);
      const tableWrap = element.closest('[class*="tableWrap"]')!.getBoundingClientRect();
      return Array.from(range.getClientRects()).map((r) => {
        const left = Math.max(0, r.left, box.x, tableWrap.left);
        const right = Math.min(innerWidth, r.right, box.x + box.width, tableWrap.right);
        const top = Math.max(0, r.top, box.y, tableWrap.top);
        const bottom = Math.min(innerHeight, r.bottom, box.y + box.height, tableWrap.bottom);
        return Math.max(0, right - left) * Math.max(0, bottom - top);
      });
    }, rect!);
    expect(overlaps, `${item.locale} ${item.width} CSS zoom ${item.zoom}: long timezone not rendered`).not.toBeNull();
    expect(overlaps!.every((area) => area === 0), `${item.locale} ${item.width}: table Help obscures timezone`).toBe(true);
    const evidenceDir = process.env.ISSUE278_TZ_EVIDENCE_DIR;
    if (evidenceDir && item.zoom === false && [1440, 390].includes(item.width)) {
      mkdirSync(evidenceDir, { recursive: true });
      const id = `${item.locale}-${item.width}`;
      // Reproduce the single old CSS declaration for an exact scoped visual comparison.
      const priorStyle = await page.addStyleTag({ content:
        '[class*="tableCorner"] { inset-block-start: .5rem !important; }' });
      await page.screenshot({ path: join(evidenceDir, `${id}-prior-position.png`), fullPage: true });
      await priorStyle.evaluate((element) => element.remove());
      await page.screenshot({ path: join(evidenceDir, `${id}-fixed.png`), fullPage: true });
    }
    if (item.zoom === "native") await help.press("Enter");
    else await help.click();
    const dialog = page.getByRole("dialog", { name: entry.title, exact: true });
    await expect(dialog).toContainText(entry.body);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(help).toBeFocused();
  }
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  expect(writes).toEqual([]);
});
