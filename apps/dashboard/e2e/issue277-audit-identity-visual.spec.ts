import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { DashboardApiFixture, E2E_IDS, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { md04FeatureAuthority, MD04_IDS } from "./support/md04-fixtures";

const variant = process.env.ISSUE277_VISUAL_VARIANT === "final" ? "final" : "baseline";
const known = {
  eventId: MD04_IDS.eventLocation,
  eventType: "VALET_SESSION_COMPLETED" as const,
  occurredAt: "2026-09-22T08:04:00.000Z",
  scope: { kind: "LOCATION" as const, locationId: LOCATION_A.locationId },
  entity: { id: MD04_IDS.sessionA, type: "VALET_SESSION" as const },
  actor: { type: "MEMBERSHIP" as const, membershipId: E2E_IDS.membership },
  details: {
    kind: "SESSION" as const, fromState: "HANDOFF_PENDING" as const,
    toState: "COMPLETED" as const, fromVersion: 9, toVersion: 10,
  },
};
const enriched = {
  ...known,
  actor: { ...known.actor, currentDisplayName: "Ahmad Saleh" },
  vehicle: { confirmedPlate: "19-52000", make: "Toyota", model: "Corolla" },
};
const evidence = join(process.cwd(), "test-results", "issue277", variant);

for (const locale of ["en", "ar"] as const) {
  for (const dark of [false, true]) {
    for (const narrow of [false, true]) {
      test(`Issue #277 ${variant} ${locale} ${dark ? "dark" : "light"} ${narrow ? "narrow" : "desktop"}`,
        async ({ page }) => {
          const width = narrow ? 390 : 1440;
          await page.setViewportSize({ width, height: 900 });
          const fixture = new DashboardApiFixture({
            companyOrganizations: [ORG_A],
            companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
            override: (path, request) => {
              if (path === "/v1/staff/dashboard/feature-authority") {
                return md04FeatureAuthority(request, "CA");
              }
              if (path.endsWith("/audit-events")) {
                return { body: { items: [variant === "final" ? enriched : known], nextCursor: null } };
              }
              return undefined;
            },
          });
          await fixture.install(page);
          await page.goto("/audit-log");
          await signInOnCurrentPage(page);
          await page.getByRole("button", { name: ORG_A.name }).click();
          await page.getByRole("button", { name: LOCATION_A.name }).click();
          if (dark) {
            await page.getByRole("group", { name: "Theme" }).getByRole("button").nth(1).click();
          }
          if (locale === "ar") {
            await page.getByRole("button", { name: "Language", exact: true }).click();
          }
          // The Next development indicator belongs to the test server, not
          // Dashboard UI. Exclude it from both screenshot sets.
          await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
          await expect(page.getByRole("table")).toContainText(
            variant === "final" ? "Ahmad Saleh" : locale === "ar" ? "عضو فريق العمل" : "Staff member",
          );
          if (variant === "final") {
            await expect(page.getByRole("table")).toContainText("19-52000");
          }
          await page.evaluate(() => document.fonts.ready);
          const name = `${locale}-${dark ? "dark" : "light"}-${narrow ? "narrow" : "desktop"}`;
          mkdirSync(evidence, { recursive: true });
          const geometry = await page.locator("main table thead th").evaluateAll(
            (nodes) => nodes.map((node) => {
              const rect = node.getBoundingClientRect();
              return { x: rect.x, width: rect.width, height: rect.height };
            }),
          );
          writeFileSync(
            join(evidence, `${name}-geometry.json`),
            JSON.stringify(geometry),
          );
          await page.screenshot({
            path: join(evidence, `${name}-table.png`),
            animations: "disabled",
          });
          await page.getByRole("table").getByRole("button").first().click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await expect(page.getByRole("dialog")).toContainText(E2E_IDS.membership);
          await expect(page.getByRole("dialog")).toContainText(MD04_IDS.sessionA);
          if (variant === "final") {
            await expect(page.getByRole("dialog")).toContainText("19-52000");
            await expect(page.getByRole("dialog")).toContainText(
              locale === "ar" ? "دليل الموظفين الحالي" : "Current staff directory",
            );
          }
          await page.screenshot({
            path: join(evidence, `${name}-drawer.png`),
            animations: "disabled",
          });
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog")).toHaveCount(0);
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        });
    }
  }
}
