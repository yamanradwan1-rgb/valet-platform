import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { md04AuditReply } from "./support/md04-audit-fixtures";
import { md04FeatureAuthority } from "./support/md04-fixtures";

test("Original Audit Events shell RTL document-root CSS zoom2 snapshot baseline", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => path === "/v1/staff/dashboard/feature-authority"
      ? md04FeatureAuthority(request, "CA") : md04AuditReply(path, request, "CA"),
  });
  await fixture.install(page);
  await page.goto("/audit-log");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "سجل التدقيق" })).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
    window.scrollTo(0, 0);
    document.querySelectorAll("main").forEach((node) => { node.scrollTop = 0; });
  });
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() =>
      requestAnimationFrame(() => resolve())));
  });
  const folder = join(process.cwd(), "test-results", "issue300-concept-a-ui");
  mkdirSync(folder, { recursive: true });
  await page.screenshot({
    path: join(folder, "native-original-audit-ar-csszoom2-768.png"),
    animations: "disabled",
  });
  await expect(page.getByRole("heading", { name: "سجل التدقيق" })).toBeVisible();
  const geometry = await page.evaluate(() => ({
    heading: document.querySelector("h1")?.getBoundingClientRect().toJSON(),
    shell: document.querySelector('[class*="shell"]')?.getBoundingClientRect().toJSON(),
  }));
  console.log("Existing native Audit shell RTL CSSzoom2", JSON.stringify(geometry));
});
