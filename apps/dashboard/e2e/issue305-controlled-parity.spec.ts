import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { operationsReadReply, sessionItem } from "./support/operations-fixtures";

const folder = resolve(process.cwd(), "../../docs/validation/issue-305");
const pages = ["live-operations", "vehicles", "tasks", "incidents"] as const;

function fixture() {
  return new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview/live-sessions`) {
        return { body: { items: [{
          ...sessionItem(),
          checkedInBy: { firstName: "Carmen", lastName: "Original" },
          parkedBy: { firstName: "Nora", lastName: "Parker" },
          parkingCompletionProof: "PROVEN",
        }], nextCursor: null } };
      }
      return operationsReadReply(path);
    },
  });
}

async function ready(page: Page) {
  await expect.poll(async () => page.locator("table").first().locator("tbody tr").evaluateAll(
    (rows) => rows.filter((row) => row.querySelectorAll("td").length > 1).length,
  )).toBeGreaterThan(0);
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const portal of document.querySelectorAll("nextjs-portal")) {
      portal.setAttribute("style", "display:none !important");
    }
  });
}

async function capturePair(page: Page, name: string) {
  await ready(page);
  const control = await page.addStyleTag({
    content: "table thead th:not(:last-child) { text-align: center !important; }",
  });
  await page.screenshot({
    path: resolve(folder, "controlled-before", name + ".png"),
    fullPage: true,
    animations: "disabled",
  });
  await control.evaluate((element) => element.remove());
  await page.screenshot({
    path: resolve(folder, "controlled-after", name + ".png"),
    fullPage: true,
    animations: "disabled",
  });
  await expect(page.locator("table").first().locator("thead th").first()).toHaveCSS("text-align", "start");
  await expect(page.locator("table").first().locator("thead th").last()).toHaveCSS("text-align", "end");
}

for (const path of pages) {
  test(`${path}: same-render controlled legacy-vs-fixed header pixels`, async ({ page }) => {
    test.setTimeout(90_000);
    mkdirSync(resolve(folder, "controlled-before"), { recursive: true });
    mkdirSync(resolve(folder, "controlled-after"), { recursive: true });
    await fixture().install(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/" + path);
    await signInOnCurrentPage(page);
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page.getByRole("button", { name: LOCATION_A.name }).click();
    await ready(page);

    await page.getByRole("button", { name: "Dark" }).click();
    await capturePair(page, `${path}-en-dark-1440-100`);

    await page.getByRole("button", { name: "Language" }).click();
    await page.setViewportSize({ width: 390, height: 900 });
    await capturePair(page, `${path}-ar-dark-390-100`);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "فاتح" }).click();
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
    await capturePair(page, `${path}-ar-light-320-200`);
  });
}
