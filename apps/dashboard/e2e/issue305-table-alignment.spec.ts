import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { operationsReadReply, sessionItem } from "./support/operations-fixtures";

const phase = process.env.ISSUE305_PHASE === "before" ? "before" : "after";
const output = resolve(process.cwd(), "../../docs/validation/issue-305", phase);
const paths = ["live-operations", "vehicles", "tasks", "incidents"] as const;
const widths = [320, 390, 768, 1440] as const;

type Capture = {
  page: string;
  locale: "en" | "ar";
  theme: "light" | "dark";
  width: number;
  zoom: number;
  tables: Awaited<ReturnType<typeof measureTables>>;
};

async function measureTables(page: Page) {
  return page.locator("table").evaluateAll((tables) => tables.map((table, tableIndex) => {
    const headingCells = Array.from(table.querySelectorAll("thead th"));
    const rows = Array.from(table.querySelectorAll("tbody tr"))
      .filter((row) => row.querySelectorAll("td").length === headingCells.length)
      .slice(0, 2);
    const direction = getComputedStyle(table).direction;
    return {
      tableIndex,
      direction,
      tableBox: table.getBoundingClientRect().toJSON(),
      columns: headingCells.map((heading, index) => {
        const rect = heading.getBoundingClientRect();
        const style = getComputedStyle(heading);
        const headingZoom = rect.width / heading.offsetWidth;
        const range = document.createRange();
        range.selectNodeContents(heading);
        const text = range.getBoundingClientRect();
        const startEdge = direction === "rtl" ? rect.right - parseFloat(style.paddingRight) * headingZoom : rect.left + parseFloat(style.paddingLeft) * headingZoom;
        const textStart = direction === "rtl" ? text.right : text.left;
        return {
          index,
          name: heading.textContent?.trim() ?? "",
          action: index === headingCells.length - 1 && !!heading.className,
          headingAlign: style.textAlign,
          headerBox: rect.toJSON(),
          headingContentStart: startEdge,
          headingTextStart: textStart,
          headingTextOffset: Number((textStart - startEdge).toFixed(3)),
          rows: rows.map((row) => {
            const cell = row.querySelectorAll("td")[index]!;
            const cellRect = cell.getBoundingClientRect();
            const cellStyle = getComputedStyle(cell);
            const cellZoom = cellRect.width / cell.offsetWidth;
            const textWalker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
            let textNode: Text | null = null;
            while (textWalker.nextNode()) {
              const node = textWalker.currentNode as Text;
              if (node.data.trim()) { textNode = node; break; }
            }
            const bodyRange = document.createRange();
            if (textNode) bodyRange.selectNodeContents(textNode);
            const bodyTextBox = textNode ? bodyRange.getBoundingClientRect().toJSON() : null;
            const bodyStart = direction === "rtl" ? cellRect.right - parseFloat(cellStyle.paddingRight) * cellZoom : cellRect.left + parseFloat(cellStyle.paddingLeft) * cellZoom;
            return {
              cellBox: cellRect.toJSON(),
              cellAlign: cellStyle.textAlign,
              cellContentStart: bodyStart,
              bodyTextBox,
              contentOffset: Number((bodyStart - startEdge).toFixed(3)),
            };
          }),
        };
      }),
    };
  }));
}

async function snapshot(page: Page, name: string) {
  await page.evaluate(async () => document.fonts.ready);
  const measures = await measureTables(page);
  const file = `${output}/${name}`;
  const isRepresentative = name.includes("-en-dark-1440-100") ||
    name.includes("-ar-dark-390-100") || name.includes("-ar-light-320-200");
  if (isRepresentative) {
    await page.screenshot({ path: `${file}.png`, fullPage: true, animations: "disabled" });
  }
  return measures;
}

test.describe.configure({ mode: "serial" });

for (const path of paths) {
  test(`${path}: header text and body start geometry, responsive RTL/LTR and themes`, async ({ page }) => {
    mkdirSync(output, { recursive: true });
    const captures: Capture[] = [];
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (requestPath) => {
        if (requestPath === `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview/live-sessions`) {
          return {
            body: {
              items: [{
                ...sessionItem(),
                checkedInBy: { firstName: "Carmen", lastName: "Original" },
                parkedBy: { firstName: "Nora", lastName: "Parker" },
                parkingCompletionProof: "PROVEN",
              }],
              nextCursor: null,
            },
          };
        }
        return operationsReadReply(requestPath);
      },
    });
    await fixture.install(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${path}`);
    await signInOnCurrentPage(page);
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page.getByRole("button", { name: LOCATION_A.name }).click();
    await expect.poll(async () => page.locator("table").first().locator("tbody tr").evaluateAll(
      (rows) => rows.filter((row) => row.querySelectorAll("td").length > 1).length,
    )).toBeGreaterThan(0);

    const modes = [
      { locale: "en", theme: "light" },
      { locale: "en", theme: "dark" },
      { locale: "ar", theme: "dark" },
      { locale: "ar", theme: "light" },
    ] as const;
    for (const mode of modes) {
      if (mode.locale === "en" && mode.theme === "dark") {
        await page.getByRole("button", { name: "Dark" }).click();
      }
      if (mode.locale === "ar" && mode.theme === "dark") {
        await page.getByRole("button", { name: "Language" }).click();
      }
      if (mode.locale === "ar" && mode.theme === "light") {
        await page.getByRole("button", { name: "فاتح" }).click();
      }
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        for (const zoom of [100, 200]) {
          await page.evaluate((percent) => { document.documentElement.style.zoom = `${percent}%`; }, zoom);
          const name = `${path}-${mode.locale}-${mode.theme}-${width}-${zoom}`;
          const tables = await snapshot(page, name);
          captures.push({ page: path, ...mode, width, zoom, tables });
          if (phase === "after") {
            for (const table of tables) {
              for (const column of table.columns) {
                if (column.action) {
                  expect(column.headingAlign, name).toBe("end");
                } else {
                  expect(column.headingAlign, `${name} ${column.name}`).toBe("start");
                  expect(Math.abs(column.headingTextOffset), `${name} ${column.name}`).toBeLessThan(1.5);
                  for (const row of column.rows) {
                    expect(Math.abs(row.contentOffset), `${name} ${column.name}`).toBeLessThan(1.5);
                  }
                }
              }
            }
          }
        }
        await page.evaluate(() => { document.documentElement.style.zoom = ""; });
      }
    }
    writeFileSync(`${output}/${path}-geometry.json`, JSON.stringify(captures, null, 2));
  });
}
