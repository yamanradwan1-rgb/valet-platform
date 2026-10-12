import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import {
  fixedRoleReference,
  roleReferenceCopy,
} from "../src/features/administration/roles/role-reference";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

const staffPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/staff`;
const visualDirectory = join(process.cwd(), "../../tmp/issue242/visual");

function expectReferenceRequestBudget(fixture: DashboardApiFixture) {
  expect(fixture.count(staffPath)).toBe(0);
  // Permit only existing shared authentication/scope/commercial discovery,
  // including dashboard-scope.ts / resolve-navigation-authority.ts discovery.
  // Any new per-role capability, directory or permission-probe route fails.
  for (const path of fixture.counts.keys()) {
    expect(path).toMatch(
      /^\/v1\/staff\/(?:auth\/(?:login|refresh|mfa\/state)|operational-context|dashboard\/feature-authority|(?:management|dashboard)\/organizations(?:\/[^/]+\/(?:locations|context|subscription))?|dashboard\/locations\/[^/]+\/subscription)$/u,
    );
  }
}

test("Company Admin has a fixed read-only EN/AR role reference with zero feature requests", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
  await fixture.install(page);
  await page.goto("/roles-permissions");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", { name: "All Locations", exact: true })
    .click();
  const content = page.getByTestId("md02-page");
  const table = content.getByRole("table");
  await expect(
    page
      .getByRole("navigation")
      .getByRole("link", { name: "Roles & Permissions", exact: true }),
  ).toBeVisible();
  await expect(content.getByRole("tablist")).toHaveCount(0);
  await expect(content.getByRole("tab")).toHaveCount(0);
  // #278-D adds two informational controls to the otherwise read-only role reference.
  await expect(content.getByRole("button", { name: /^Help:/u })).toHaveCount(2);
  await expect(content.getByRole("button")).toHaveCount(2);
  await expect(content.locator("input, select, textarea")).toHaveCount(0);
  await expect(content.getByRole("columnheader")).toHaveText([
    "Role",
    "Scope",
    "Capabilities",
    "Conditions / boundaries",
  ]);
  await expect(table.locator("tbody tr")).toHaveCount(4);
  await expect(content).not.toContainText("@");
  await expect(content).not.toContainText("—");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(content.getByRole("heading", { level: 1 })).toHaveCSS(
    "font-size",
    "24px",
  );
  await expect(content.getByRole("heading", { level: 1 })).toHaveCSS(
    "font-weight",
    "700",
  );
  await expect(table).toHaveCSS("font-size", "12px");
  await expect(table).toHaveCSS("line-height", "16px");
  await expect(table.getByRole("cell").first()).toHaveCSS(
    "padding",
    "16px 24px",
  );
  await expect(table.getByRole("columnheader").first()).toHaveCSS(
    "color",
    "rgb(100, 116, 139)",
  );
  const roleIcon = table
    .locator("tbody tr")
    .first()
    .getByRole("cell")
    .first()
    .locator("span");
  await expect(roleIcon).toHaveCSS("width", "32px");
  await expect(roleIcon).toHaveCSS("height", "32px");
  const region = content.getByRole("region");
  await page.keyboard.press("Tab");
  await region.focus();
  await expect(region).toBeFocused();
  await expect(region).toHaveCSS("outline-style", "solid");
  await page.getByRole("heading", { level: 1 }).click();
  // Measured at the pinned baseline / 1440px; content height follows the new copy.
  const bounds = (await table.boundingBox())!;
  expect(bounds.x).toBeCloseTo(293, 0);
  expect(bounds.width).toBeCloseTo(1114, 0);
  const heading = (await content
    .getByRole("heading", { level: 1 })
    .boundingBox())!;
  expect(heading.x).toBeCloseTo(292, 0);
  expect(heading.y).toBeCloseTo(96, 0);
  for (const locale of ["en", "ar"] as const) {
    if (locale === "ar") {
      await page.getByRole("button", { name: "Dark", exact: true }).click();
      await page.getByRole("button", { name: "Language", exact: true }).click();
      await page.setViewportSize({ width: 480, height: 900 });
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(table.getByRole("columnheader").first()).toHaveCSS(
        "color",
        "rgb(148, 163, 184)",
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(480);
      expect(
        await region.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        ),
      ).toBe(true);
      await region.focus();
      await expect(region).toBeFocused();
      await page.keyboard.press("ArrowLeft");
      await expect
        .poll(() => region.evaluate((element) => element.scrollLeft))
        .toBeLessThan(0);
      await region.evaluate((element) => {
        element.scrollLeft = 0;
      });
      await content.getByRole("heading", { level: 1 }).click();
    }
    for (const [index, reference] of fixedRoleReference(locale).entries()) {
      const cells = table.locator("tbody tr").nth(index).getByRole("cell");
      await expect(cells).toHaveText([
        reference.label,
        reference.scope,
        reference.capabilities,
        reference.conditions,
      ]);
    }
    await expect(content).toContainText(roleReferenceCopy(locale).explanation);
    await page.evaluate(async () => document.fonts.ready);
    mkdirSync(visualDirectory, { recursive: true });
    const screenshot = join(
      visualDirectory,
      `after-${locale === "en" ? "en-light-desktop" : "ar-dark-narrow"}.png`,
    );
    await page.screenshot({
      path: screenshot,
      fullPage: true,
      animations: "disabled",
    });
    await testInfo.attach(`${locale} role reference`, {
      path: screenshot,
      contentType: "image/png",
    });
  }
  expectReferenceRequestBudget(fixture);
  await testInfo.attach("request budget", {
    body: JSON.stringify({
      staffDirectory: fixture.count(staffPath),
      permissionProbes: 0,
      requests: Object.fromEntries(fixture.counts),
    }),
    contentType: "application/json",
  });
});

test("Location Manager navigation and direct route retain the existing authority boundary", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
  await fixture.install(page);
  await page.goto("/roles-permissions");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(
    page.getByRole("navigation", { name: "Management navigation" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Roles & Permissions", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Roles & Permissions", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByTestId("md02-page")).toHaveCount(0);
  expectReferenceRequestBudget(fixture);
});
