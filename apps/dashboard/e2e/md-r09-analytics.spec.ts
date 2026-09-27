import { expect, test } from "@playwright/test";
import { standardCompanyFixture } from "./support/md05-analytics-fixtures";
import {
  companyAnalyticsPath,
  PERIOD_A,
} from "./support/md05-intelligence-fixtures";
import {
  cards,
  durationCompany,
  enterR09,
  expectNoLocationRequests,
  pageRoot,
} from "./support/md-r09-fixtures";

test("Analytics exposes compact durations and exact accessible source evidence within four cards and two panels", async ({
  page,
}) => {
  const fixture = standardCompanyFixture((path, request) =>
    path === companyAnalyticsPath
      ? { body: durationCompany(request) }
      : undefined,
  );
  await fixture.install(page);
  await enterR09(page, "analytics");
  const root = pageRoot(page, "analytics");
  await expect(page.getByTestId("analytics-card-value")).toHaveText([
    "7",
    "10m 40s",
    "83.33%",
    "1",
  ]);
  await expect(cards(page, "analytics")).toHaveCount(4);
  await expect(page.getByTestId("analytics-chart-panel")).toHaveCount(2);
  await expect(root).not.toContainText(/Guest Satisfaction|Revenue Trend/u);
  const evidence = cards(page, "analytics").nth(1).locator("summary");
  await evidence.focus();
  await page.keyboard.press("Enter");
  await expect(cards(page, "analytics").nth(1)).toContainText(
    "Average seconds: 640.000",
  );
  await expect(
    cards(page, "analytics").nth(1).locator("details"),
  ).toHaveAttribute("open", "");
  const chart = page.getByTestId("analytics-duration-chart");
  await chart.locator("summary").focus();
  await page.keyboard.press("Enter");
  const rows = page.getByTestId("analytics-duration-text").locator("tbody tr");
  await expect(rows.nth(2).locator("td")).toHaveText([
    "Avg. Retrieval Wait",
    "10m 40s",
    "640.000",
    "2",
    "2",
  ]);
  await expect(rows.nth(1).locator("td")).toHaveText([
    "Parking Time",
    "0s",
    "0.000",
    "2",
    "2",
  ]);
  await expect(rows.nth(4).locator("td")).toHaveText([
    "Handoff Time",
    "Unavailable",
    "Unavailable",
    "0",
    "0",
  ]);
  await chart.getByRole("region").focus();
  await expect(chart.getByRole("region")).toBeFocused();
  await page.getByTestId("analytics-activity-chart").locator("summary").click();
  const activity = page
    .getByTestId("analytics-activity-text")
    .locator("tbody tr");
  await expect(activity).toHaveCount(1);
  await expect(activity.first().locator("td")).toHaveText([PERIOD_A.from, "7"]);
  await page.getByText("Timezone boundaries", { exact: true }).click();
  const boundaries = page.getByRole("list", { name: "Timezone boundaries" });
  await boundaries.focus();
  await expect(boundaries).toBeFocused();
  await page.getByText("Analytics source evidence", { exact: true }).click();
  const source = page.getByRole("region", {
    name: "Analytics source evidence",
  });
  await source.focus();
  await expect(source).toBeFocused();
  await expect(page.getByTestId("analytics-company-coverage")).toContainText(
    "Asia/Amman",
  );
  expect(fixture.count(companyAnalyticsPath)).toBe(1);
  expectNoLocationRequests(fixture);
});
