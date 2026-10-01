import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  ORG_A,
  LOCATION_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  staffItem,
  staffDetail,
  staffPath,
} from "./support/administration-r05-fixtures";

const phase = process.env.T05A_VISUAL_PHASE ?? "after";
const out = join(process.env.TEMP ?? ".", "vaylet-t05a", phase);
const names = [
  { firstName: "Maya", lastName: "O’Connor" },
  { firstName: "عبد الرحمن مُحَمَّد", lastName: "الخطّاب أبو زيد" },
  { firstName: null, lastName: null },
];
const emails = ["maya@example.com", "arabic@example.com", "legacy@example.com"];
const rows = names.map((name, index) =>
  staffItem({
    identity:
      phase === "before"
        ? { email: emails[index] }
        : { ...name, email: emails[index] },
    membershipId: `77777777-7777-4777-8777-77777777790${index}`,
  }),
);

test("T05-A frozen Employees table and drawer EN/light/desktop AR/dark/narrow", async ({
  page,
}) => {
  mkdirSync(out, { recursive: true });
  const path = staffPath(ORG_A.organizationId);
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (requestPath) => {
      if (requestPath === path)
        return { body: { items: rows, nextCursor: null } };
      const row = rows.find(
        (item) => requestPath === `${path}/${item.membershipId}`,
      );
      if (row) return { body: staffDetail(row) };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", { name: "All Locations", exact: true })
    .click();
  await expect(
    page.getByRole("table").getByText(emails[0]!, { exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.getByTestId("md02-page").evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    );
  });
  const geometry: Record<string, unknown> = {};
  for (const mode of ["en-light-desktop", "ar-dark-narrow"]) {
    if (mode.startsWith("ar")) {
      await page.getByRole("button", { name: "Dark", exact: true }).click();
      await page.getByRole("button", { name: "Language", exact: true }).click();
      await page.setViewportSize({ width: 480, height: 900 });
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    }
    const table = page.getByRole("table");
    const rowBox = await table.getByRole("row").nth(1).boundingBox();
    expect(rowBox?.height).toBeCloseTo(69, 1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(mode.startsWith("ar") ? 480 : 1440);
    geometry[mode] = {
      table: await table.boundingBox(),
      row: rowBox,
      search: await page.getByRole("searchbox").boundingBox(),
      heading: await page.getByRole("heading", { level: 1 }).boundingBox(),
    };
    await page.screenshot({
      path: join(out, `${mode}-table.png`),
      fullPage: true,
    });
    await table
      .getByRole("button")
      .nth(mode.startsWith("ar") ? 1 : 0)
      .click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    geometry[`${mode}-drawer`] = await drawer.boundingBox();
    await page.screenshot({
      path: join(out, `${mode}-drawer.png`),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
  }
  writeFileSync(join(out, "geometry.json"), JSON.stringify(geometry, null, 2));
});
