import { expect, test, type Page, type Request } from "@playwright/test";

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

interface CorrectionState {
  name: string;
  updatedAt: string;
}

function searchReply(request: Request, state: CorrectionState) {
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

async function enterCorrection(page: Page, fixture: DashboardApiFixture) {
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
  return page.getByRole("dialog", { name: "Correct Visit Contact" });
}

test("Sensitive MFA never auto-replays a Visit Contact correction", async ({ page }) => {
  const writes: unknown[] = [];
  const state: CorrectionState = {
    name: "Correction Contact",
    updatedAt: "2026-09-22T10:00:00.000Z",
  };
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    mfaState: "ASSURED",
    override: (path, request) => {
      if (path === "/v1/staff/dashboard/feature-authority") return md04FeatureAuthority(request, "CA");
      if (path === visitSearchPath) return searchReply(request, state);
      if (path === customerHistoryPath) return historyReply(request, "CA");
      if (path === nameCorrectionPath && request.method() === "POST") {
        writes.push(request.postDataJSON());
        if (writes.length === 1) {
          return {
            status: 403,
            body: { code: "MFA_STEP_UP_REQUIRED", message: "step up", requestId: "mfa-write" },
          };
        }
        state.name = "Correction Updated";
        state.updatedAt = "2026-09-22T10:05:00.000Z";
        return { body: { changed: true, customerId: MD04_IDS.customerA, updatedAt: state.updatedAt } };
      }
      return undefined;
    },
  });
  let dialog = await enterCorrection(page, fixture);
  await dialog.getByRole("textbox", { name: "Display name", exact: true }).fill("Correction Updated");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => writes.length).toBe(1);
  await expect(page.getByRole("dialog", { name: "Verification required" })).toBeVisible();
  expect(writes).toHaveLength(1);

  await page.getByLabel("6-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Verify" }).click();
  dialog = page.getByRole("dialog", { name: "Correct Visit Contact" });
  await expect(dialog.getByText(/Verification succeeded/)).toBeVisible();
  expect(writes).toHaveLength(1);
  await expect(dialog.getByRole("textbox", { name: "Display name", exact: true })).toHaveValue("Correction Updated");

  await dialog.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[0]).toEqual({
    displayName: "Correction Updated",
    expectedUpdatedAt: "2026-09-22T10:00:00.000Z",
  });
  expect(writes[1]).toEqual(writes[0]);
  await expect(dialog.getByText("Latest server value")).toBeVisible();
  await expect(dialog.getByText("Correction Updated", { exact: true })).toBeVisible();
});

test("CAS conflict keeps draft and explicit retry uses newly read expectedUpdatedAt", async ({ page }) => {
  const writes: unknown[] = [];
  const state: CorrectionState = {
    name: "Correction Contact",
    updatedAt: "2026-09-22T10:00:00.000Z",
  };
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path, request) => {
      if (path === "/v1/staff/dashboard/feature-authority") return md04FeatureAuthority(request, "CA");
      if (path === visitSearchPath) return searchReply(request, state);
      if (path === customerHistoryPath) return historyReply(request, "CA");
      if (path === nameCorrectionPath && request.method() === "POST") {
        writes.push(request.postDataJSON());
        if (writes.length === 1) {
          state.name = "Correction Server";
          state.updatedAt = "2026-09-22T10:06:00.000Z";
          return {
            status: 409,
            body: { code: "VERSION_CONFLICT", message: "conflict", requestId: "cas-conflict" },
          };
        }
        state.name = "Correction Draft";
        state.updatedAt = "2026-09-22T10:07:00.000Z";
        return { body: { changed: true, customerId: MD04_IDS.customerA, updatedAt: state.updatedAt } };
      }
      return undefined;
    },
  });
  const dialog = await enterCorrection(page, fixture);
  await dialog.getByRole("textbox", { name: "Display name", exact: true }).fill("Correction Draft");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => writes.length).toBe(1);
  await expect(dialog.getByText(/changed on the server/)).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Display name", exact: true })).toHaveValue("Correction Draft");
  await expect(dialog.getByText("Correction Server", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);

  await dialog.getByRole("button", { name: "I reviewed the latest result" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1]).toEqual({
    displayName: "Correction Draft",
    expectedUpdatedAt: "2026-09-22T10:06:00.000Z",
  });
});

test("unknown write outcome never retries and preserves draft through deliberate re-search", async ({ page }) => {
  const writes: unknown[] = [];
  const state: CorrectionState = {
    name: "Correction Contact",
    updatedAt: "2026-09-22T10:00:00.000Z",
  };
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path, request) => {
      if (path === "/v1/staff/dashboard/feature-authority") return md04FeatureAuthority(request, "CA");
      if (path === visitSearchPath) return searchReply(request, state);
      if (path === customerHistoryPath) return historyReply(request, "CA");
      if (path === nameCorrectionPath && request.method() === "POST") {
        writes.push(request.postDataJSON());
        state.name = "Renamed Elsewhere";
        state.updatedAt = "2026-09-22T10:08:00.000Z";
        return {
          status: 503,
          body: { code: "UNKNOWN_OUTCOME", message: "unknown", requestId: "unknown-write" },
        };
      }
      return undefined;
    },
  });
  let dialog = await enterCorrection(page, fixture);
  await dialog.getByRole("textbox", { name: "Display name", exact: true }).fill("Lost Draft");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => writes.length).toBe(1);
  await expect(dialog.getByText(/write outcome is uncertain/)).toBeVisible();
  await expect(dialog.getByText(/previous search no longer returns/)).toBeVisible();
  expect(writes).toHaveLength(1);
  await dialog.getByRole("button", { name: "Return to search" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByLabel("Name").fill("Renamed");
  await page.getByRole("button", { name: "Search" }).click();
  const row = page.locator("tbody tr").filter({ hasText: "Renamed Elsewhere" });
  await row.getByRole("button", { name: "Details" }).click();
  dialog = page.getByRole("dialog", { name: "Correct Visit Contact" });
  await expect(dialog.getByRole("textbox", { name: "Display name", exact: true })).toHaveValue("Lost Draft");
  expect(writes).toHaveLength(1);
});

test("correction reconciliation denial evicts stale contact PII", async ({ page }) => {
  let searchReads = 0;
  const state: CorrectionState = {
    name: "Correction Contact",
    updatedAt: "2026-09-22T10:00:00.000Z",
  };
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path, request) => {
      if (path === "/v1/staff/dashboard/feature-authority") return md04FeatureAuthority(request, "CA");
      if (path === visitSearchPath) {
        searchReads += 1;
        return searchReads === 1
          ? searchReply(request, state)
          : {
              status: 403,
              body: { code: "AUTHORIZATION_DENIED", message: "denied", requestId: "reconcile-revoked" },
            };
      }
      if (path === customerHistoryPath) return historyReply(request, "CA");
      if (path === nameCorrectionPath && request.method() === "POST") {
        return {
          status: 409,
          body: { code: "VERSION_CONFLICT", message: "conflict", requestId: "reconcile-conflict" },
        };
      }
      return undefined;
    },
  });
  const dialog = await enterCorrection(page, fixture);
  await dialog.getByRole("textbox", { name: "Display name", exact: true }).fill("Unsaved Draft");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog", { name: "Correct Visit Contact" })).toHaveCount(0);
  await expect(page.getByText("+962791234567", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Correction Contact", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Current server authority no longer allows/)).toBeVisible();
});

test("changed=false is a valid authoritative correction no-op", async ({ page }) => {
  const state: CorrectionState = {
    name: "Correction Contact",
    updatedAt: "2026-09-22T10:00:00.000Z",
  };
  let writes = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path, request) => {
      if (path === "/v1/staff/dashboard/feature-authority") return md04FeatureAuthority(request, "CA");
      if (path === visitSearchPath) return searchReply(request, state);
      if (path === customerHistoryPath) return historyReply(request, "CA");
      if (path === nameCorrectionPath && request.method() === "POST") {
        writes += 1;
        state.updatedAt = "2026-09-22T10:09:00.000Z";
        return { body: { changed: false, customerId: MD04_IDS.customerA, updatedAt: state.updatedAt } };
      }
      return undefined;
    },
  });
  const dialog = await enterCorrection(page, fixture);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText(/reported no data change/)).toBeVisible();
  await expect(dialog.getByText("Latest server value")).toBeVisible();
  expect(writes).toBe(1);
});
