import { expect, test, type Request } from "@playwright/test";

import { DashboardApiFixture, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  MD04_IDS,
  customer,
  customerHistoryPath,
  historyReply,
  md04FeatureAuthority,
  nameCorrectionPath,
  visitSearchPath,
} from "./support/md04-fixtures";

const state = {
  name: "Correction Contact",
  updatedAt: "2026-09-22T10:00:00.000Z",
};

function searchReply(request: Request) {
  const name = new URL(request.url()).searchParams.get("name") ?? "";
  const matches = state.name.toLocaleLowerCase().startsWith(name.toLocaleLowerCase());
  return {
    body: {
      items: matches ? [customer(state.name, "CA", MD04_IDS.customerA, state.updatedAt)] : [],
      matchState: matches ? "UNIQUE" : "NONE",
      mode: "NAME",
      nextCursor: null,
    },
  } as const;
}

test("auth reconciliation never auto-replays correction and keeps the draft", async ({ page }) => {
  let writes = 0;
  let refreshes = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path, request) => {
      if (path === "/v1/staff/auth/refresh") {
        refreshes += 1;
        return undefined;
      }
      if (path === "/v1/staff/dashboard/feature-authority") {
        return md04FeatureAuthority(request, "CA");
      }
      if (path === visitSearchPath) return searchReply(request);
      if (path === customerHistoryPath) return historyReply(request, "CA");
      if (path === nameCorrectionPath && request.method() === "POST") {
        writes += 1;
        return {
          status: 401,
          body: {
            code: "STAFF_AUTHENTICATION_REQUIRED",
            message: "refresh",
            requestId: "mutation-401",
          },
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/customers");
  await signInOnCurrentPage(page, "admin@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByLabel("Name").fill("Correction");
  await page.getByRole("button", { name: "Search" }).click();
  const row = page.locator("tbody tr").filter({ hasText: "Correction Contact" });
  await row.getByRole("button", { name: "Details" }).click();
  await page.getByRole("dialog", { name: "Correction Contact" })
    .getByRole("button", { name: "Correct name" }).click();
  const dialog = page.getByRole("dialog", { name: "Correct Visit Contact" });
  await dialog.getByRole("textbox", { name: "Display name", exact: true })
    .fill("Preserved Draft");
  await dialog.getByRole("button", { name: "Save" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(/Authentication changed during the write/)).toBeVisible();
  expect(writes).toBe(1);
  expect(refreshes).toBeGreaterThanOrEqual(1);

  await page.getByLabel("Name").fill("Correction");
  await page.getByRole("button", { name: "Search" }).click();
  const recoveredRow = page.locator("tbody tr").filter({ hasText: "Correction Contact" });
  await recoveredRow.getByRole("button", { name: "Details" }).click();
  const recovered = page.getByRole("dialog", { name: "Correct Visit Contact" });
  await expect(recovered.getByText(/Authentication changed during the write/)).toBeVisible();
  await expect(recovered.getByRole("textbox", { name: "Display name", exact: true }))
    .toHaveValue("Preserved Draft");
  await expect(recovered.getByText("Latest server value")).toBeVisible();
  await page.waitForTimeout(150);
  expect(writes).toBe(1);
});
