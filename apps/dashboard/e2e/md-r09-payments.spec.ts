import { expect, test } from "@playwright/test";
import {
  mixedEvidenceCompanyAnalytics,
  standardCompanyFixture,
  standardLocationFixture,
} from "./support/md05-analytics-fixtures";
import {
  companyAnalyticsPath,
  currentFinancialOverview,
  locationIntelligenceReply,
  locationPaths,
  PERIOD_A,
} from "./support/md05-intelligence-fixtures";
import {
  cards,
  enterR09,
  expectNoLocationRequests,
  pageRoot,
} from "./support/md-r09-fixtures";

test("Payments keeps exact currency cohorts, signed cash and inspectable null evidence", async ({
  page,
}) => {
  const fixture = standardCompanyFixture((path, request) =>
    path === companyAnalyticsPath
      ? { body: mixedEvidenceCompanyAnalytics(request) }
      : undefined,
  );
  await fixture.install(page);
  await enterR09(page, "payments");
  const root = pageRoot(page, "payments");
  await expect(cards(page, "payments")).toHaveCount(4);
  await expect(cards(page, "payments").first()).toHaveText(
    /12\.345 JOD45\.670 USDCollected/u,
  );
  await expect(root.locator('[class*="breakdownPanel"]')).toHaveCount(1);
  await expect(root.getByText("-1.500 JOD", { exact: true })).toBeVisible();
  await expect(root.getByText("1.250 USD", { exact: true })).toBeVisible();
  await expect(
    root.getByText("Unavailable (0/0)", { exact: true }),
  ).toHaveCount(4);
  await expect(root.getByText("0.000 JOD", { exact: true })).toBeVisible();
  await expect(root).not.toContainText(/Transactions|Export|Validations|FX/u);
  expect(fixture.count(companyAnalyticsPath)).toBe(1);
  expectNoLocationRequests(fixture);
});

for (const manager of [false, true]) {
  test(`${manager ? "LM" : "CA"} Payments uses one current and one exact period Location read`, async ({
    page,
  }) => {
    const seen: string[] = [];
    const fixture = standardLocationFixture(manager, (path, request) => {
      if (Object.values(locationPaths).includes(path as never)) {
        const url = new URL(request.url());
        seen.push(`${url.pathname}${url.search}`);
      }
      if (path === locationPaths.financialOverview) {
        const body = currentFinancialOverview();
        body.currencies[0]!.collectionMethodCounts = [
          { method: "NONE", count: 0 },
          { method: "CASH", count: 1 },
          { method: "DIGITAL", count: 1 },
        ];
        body.currencies[0]!.statusCounts = [
          { status: "NOT_REQUIRED", count: 0 },
          { status: "UNPAID", count: 0 },
          { status: "PENDING", count: 0 },
          { status: "PAID", count: 2 },
          { status: "FAILED", count: 0 },
        ];
        return { body };
      }
      return locationIntelligenceReply(path, request);
    });
    await fixture.install(page);
    await enterR09(page, "payments", manager ? "manager" : "location");
    const root = pageRoot(page, "payments");
    await expect(
      root.getByText(
        "Current non-completed-session projection; not period revenue.",
      ),
    ).toBeVisible();
    await expect(
      root.getByText("Not required: 0", { exact: true }),
    ).toBeVisible();
    await expect(root.getByText("Cash: 1", { exact: true })).toBeVisible();
    await expect(root.getByText("Digital: 1", { exact: true })).toBeVisible();
    await expect(root).not.toContainText(
      /NOT_REQUIRED|UNPAID|PENDING|PAID|FAILED|CASH|DIGITAL/u,
    );
    expect(seen.sort()).toEqual(
      [
        locationPaths.financialOverview,
        `${locationPaths.financial}?from=${PERIOD_A.from}&to=${PERIOD_A.to}`,
      ].sort(),
    );
    expect(fixture.count(companyAnalyticsPath)).toBe(0);
    await page.getByRole("button", { name: "Language", exact: true }).click();
    await expect(root.getByText("غير مطلوب: 0", { exact: true })).toBeVisible();
    await expect(root.getByText("نقدي: 1", { exact: true })).toBeVisible();
    await expect(
      root.getByText("قيد الانتظار: 0", { exact: true }),
    ).toBeVisible();
    expect(seen).toHaveLength(2);
  });
}
