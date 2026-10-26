import { expect, test } from "@playwright/test";
import { DashboardApiFixture, ORG_A } from "./support/dashboard-api-fixture";
import {
  enterHistory,
  historyPath,
  historyRow,
} from "./support/issue240e-history";

const path = historyPath();
function completed(id = "60000000-0000-4000-8000-000000000001") {
  return historyRow({
    shiftId: id,
    status: "ENDED",
    endedAt: "2026-10-02T07:00:00.000Z",
  });
}
function evidence(value: string, variance: string) {
  return {
    state: "REPORTED",
    snapshot: {
      cashExpected: "10.001",
      cashReported: value,
      cashVariance: variance,
      currency: "JOD",
      reportedAt: "2026-10-02T07:00:00.000Z",
      reportedBy: "Synthetic reporter",
    },
  };
}

test("#342 detail renders exact persisted cash, independent null state and refreshed evidence", async ({
  page,
}) => {
  const row = completed();
  let cash = evidence("12.345", "2.344");
  await new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (route) => {
      if (route === path) return { body: { items: [row], nextCursor: null } };
      if (route === `${path}/${row.shiftId}`)
        return { body: { ...row, cashReconciliation: cash } };
      return undefined;
    },
  }).install(page);
  await enterHistory(page);
  await page.getByRole("table").getByRole("button").first().click();
  const section = page.getByRole("region", { name: "Cash Reconciliation" });
  await expect(section).toContainText("12.345");
  await expect(section).toContainText("+2.344");
  await expect(section).toContainText("Synthetic reporter");
  await expect(section).toContainText("does not confirm management receipt");
  await expect(section.getByRole("button")).toHaveCount(0);
  await page.keyboard.press("Escape");
  cash = evidence("9.999", "-0.002");
  await page.getByRole("table").getByRole("button").first().click();
  await expect(section).toContainText("-0.002");
  await expect(section).not.toContainText("12.345");
});

test("#342 delayed prior Shift response cannot restore its cash after filter/Shift selection", async ({
  page,
}) => {
  const old = completed();
  const fresh = completed("60000000-0000-4000-8000-000000000002");
  let release: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    started = resolve;
  });
  await new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: async (route, request) => {
      if (route === path)
        return {
          body: {
            items: [
              new URL(request.url()).searchParams.has("status") ? fresh : old,
            ],
            nextCursor: null,
          },
        };
      if (route === `${path}/${old.shiftId}`) {
        started!();
        await blocked;
        return {
          body: { ...old, cashReconciliation: evidence("888.888", "878.887") },
        };
      }
      if (route === `${path}/${fresh.shiftId}`)
        return {
          body: {
            ...fresh,
            cashReconciliation: { state: "NOT_REPORTED", snapshot: null },
          },
        };
      return undefined;
    },
  }).install(page);
  await enterHistory(page);
  await page.getByRole("table").getByRole("button").first().click();
  await pending;
  // Filter change retires the prior detail generation before opening another Shift.
  await page.keyboard.press("Escape");
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("ENDED");
  await page.getByRole("table").getByRole("button").first().click();
  const section = page.getByRole("region", { name: "Cash Reconciliation" });
  await expect(section).toContainText("Not reported");
  release!();
  await expect(section).not.toContainText("888.888");
  await expect(section).toContainText("Not reported");
});
