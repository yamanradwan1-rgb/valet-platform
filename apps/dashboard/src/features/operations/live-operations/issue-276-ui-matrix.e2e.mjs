import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { DashboardApiFixture, LOCATION_A, ORG_A } from "../../../../e2e/support/dashboard-api-fixture";
import { signInOnCurrentPage } from "../../../../e2e/support/foundation-ui";
import { sessionItem, stateCounts } from "../../../../e2e/support/operations-fixtures";

const base = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview`;
const longName = "AbdullahWithAnExceptionallyLongSyntheticFirstName";

test("Live EN/AR × Light/Dark and narrow drawer use valid DOM with focus restoration", async ({ page }) => {
  const evidenceDirectory = resolve(process.cwd(), "../../tmp/issue276-u004-evidence");
  await mkdir(evidenceDirectory, { recursive: true });
  const invalidNesting = [];
  page.on("console", (message) => {
    if (/cannot be a child of <tbody>|<tbody> cannot contain/u.test(message.text())) {
      invalidNesting.push(message.text());
    }
  });
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === `${base}/session-state-counts`) return { body: stateCounts() };
      if (path === `${base}/live-sessions`) {
        return {
          body: {
            items: [sessionItem({
              state: "PARKED",
              activeTask: null,
              checkedInBy: { firstName: "مها", lastName: "الحسن" },
              parkedBy: { firstName: longName, lastName: "Parker" },
              parkingCompletionProof: "PROVEN",
            })],
            nextCursor: null,
          },
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  // Development-only Next indicator is not part of the shipped dashboard.
  // Hide just that injected overlay in the visual evidence captures.
  await page.addStyleTag({ content: "nextjs-portal { visibility: hidden !important; }" });
  for (const locale of ["en", "ar"]) {
    if (locale === "ar") {
      await page.getByRole("button", { name: "Language" }).click();
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    }
    for (const theme of ["light", "dark"]) {
      const name = locale === "en"
        ? theme === "light" ? "Light" : "Dark"
        : theme === "light" ? "فاتح" : "داكن";
      await page.getByRole("button", { name, exact: true }).click();
      await expect(page.getByRole("button", { name, exact: true }))
        .toHaveAttribute("aria-pressed", "true");
      const table = page.getByRole("table");
      await expect(table.getByRole("columnheader")).toHaveCount(6);
      await expect(table).toContainText(longName);
      const details = table.getByRole("button", { name: /Details|التفاصيل/u }).first();
      await details.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate((node) =>
        node.parentElement?.parentElement === node.ownerDocument.body)).toBe(true);
      await expect(dialog).toContainText("مها الحسن");
      await page.screenshot({
        path: resolve(evidenceDirectory, "live-" + locale + "-" + theme + "-desktop.png"),
        animations: "disabled",
      });
      await page.setViewportSize({ width: 480, height: 900 });
      await expect(dialog).toBeVisible();
      await page.screenshot({
        path: resolve(evidenceDirectory, "live-" + locale + "-" + theme + "-narrow.png"),
        animations: "disabled",
      });
      // 200%-zoom *layout proxy*: on a 1440x900 physical desktop, browser
      // zoom yields roughly a 720x450 CSS layout viewport. Chromium's
      // synthetic Ctrl+Plus does NOT change headless browser zoom, so this
      // verifies reflow/visibility only, not a genuine manual 200% UI signoff.
      await page.setViewportSize({ width: 720, height: 450 });
      await expect(dialog).toBeVisible();
      const zoomBox = await dialog.boundingBox();
      expect(zoomBox?.width).toBeLessThanOrEqual(720);
      expect(zoomBox?.height).toBeLessThanOrEqual(450);
      await page.screenshot({
        path: resolve(evidenceDirectory, "live-" + locale + "-" + theme + "-zoom200-layout-proxy.png"),
        animations: "disabled",
      });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(details).toBeFocused();
    }
  }
  await page.setViewportSize({ width: 480, height: 900 });
  expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(480);
  const button = page.getByRole("table").getByRole("button", { name: /Details|التفاصيل/u });
  await button.scrollIntoViewIfNeeded();
  await button.click();
  const box = await page.getByRole("dialog").boundingBox();
  expect(box?.width).toBeLessThanOrEqual(480);
  await expect(page.getByRole("dialog")).toContainText("مها الحسن");
  expect(invalidNesting).toEqual([]);
});
