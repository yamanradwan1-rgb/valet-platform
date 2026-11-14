import { expect, test } from "@playwright/test";
import { staffDirectoryItem } from "./support/administration-fixtures";
import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { openEmployees, STAFF_BASE } from "./support/issue240d-onboarding";

test.use({ trace: "off" });

const employee = staffDirectoryItem();
const detailPath = `${STAFF_BASE}/${employee.membershipId}`;
const statusPath = `${detailPath}/password-resets/status`;
const issuePath = `${detailPath}/password-resets`;
const resetLink = `https://staff.example/staff/reset-password#reset=vspr1.${"A".repeat(43)}`;

test("older status.refresh GET finishing after newer reconciliation GET cannot downgrade a reset generation", async ({ page }) => {
  let generation = 0;
  let statusReads = 0;
  const commands: Array<{ operationId: string; expectedGeneration: number }> = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === STAFF_BASE) return { body: { items: [employee], nextCursor: null } };
      if (path === detailPath) return { body: {
        ...employee,
        locationAccess: {
          items: [{ locationId: LOCATION_A.locationId, name: LOCATION_A.name, status: "ACTIVE" }],
          totalCount: 1, truncated: false,
        },
        pendingInvitation: null,
      } };
      if (path === statusPath) {
        statusReads++;
        if (statusReads === 3) {
          // The first direct reconcile fails. A retry is required to establish authority.
          return { status: 503, body: {
            code: "STAFF_PASSWORD_RESET_UNAVAILABLE",
            message: "Synthetic GET outage", requestId: "status-3",
          } };
        }
        const old = statusReads === 4;
        return {
          delayMs: old ? 800 : statusReads === 5 ? 30 : 0,
          headers: { "x-reset-status-race": old ? "older-normal" : statusReads === 5 ? "newer-direct" : "other" },
          // A delayed stale read from the normal GET must not supersede
          // a later successful direct reconciliation for the same operation.
          body: {
            eligible: true, latestGeneration: old ? 0 : generation,
            linkState: old ? "NONE" : generation ? "ACTIVE" : "NONE",
            expiresAt: null,
          },
        };
      }
      if (path === issuePath) {
        const command = request.postDataJSON();
        commands.push(command);
        generation++;
        if (commands.length === 1) {
          // The server committed generation 1 before returning a 500.
          return { status: 500, body: {
            code: "STAFF_PASSWORD_RESET_UNAVAILABLE",
            message: "Synthetic response lost after commit", requestId: "issue-1",
          } };
        }
        return { status: 201, body: {
          outcome: "LINK_ISSUED", membershipId: employee.membershipId,
          generation, expiresAt: "2026-11-14T10:00:00.000Z", resetLink,
        } };
      }
      return undefined;
    },
  });
  await openEmployees(page, fixture);
  await page.getByRole("table").getByRole("button").first().click();
  const trigger = page.getByRole("dialog").first().getByRole("button", { name: "Reset password" });
  await trigger.click();
  const modal = page.getByRole("dialog", { name: "Reset employee password" });
  await modal.getByRole("button", { name: "Generate a password reset link" }).click();
  await expect(modal.getByText(/Current status could not be verified/)).toBeVisible();
  expect(commands).toHaveLength(1);
  expect(statusReads).toBe(3);

  await modal.getByRole("button", { name: "Close" }).click();
  await expect(modal).toHaveCount(0);
  const olderResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === statusPath &&
    response.headers()["x-reset-status-race"] === "older-normal");
  await trigger.click(); // normal status.refresh starts stale GET #4, still pending
  await expect.poll(() => fixture.count(statusPath)).toBe(4);
  await modal.getByRole("button", { name: "Refresh status" }).click(); // direct GET #5
  const replacement = modal.getByRole("button", { name: "Generate a replacement link" });
  await expect(replacement).toBeEnabled(); // #5 returns generation 1 first
  expect(statusReads).toBe(5);
  expect(commands).toHaveLength(1); // never auto repeat POST

  await olderResponse; // stale normal GET #4 returns generation 0 later
  await page.waitForTimeout(100); // let React consume the delayed response
  await expect(replacement).toBeEnabled();
  await expect(modal.getByRole("button", { name: "Copy link" })).toHaveCount(0);
  await replacement.click();
  await expect(modal.getByRole("button", { name: "Copy link" })).toBeVisible();
  expect(commands).toHaveLength(2);
  expect(commands[0]!.expectedGeneration).toBe(0);
  expect(commands[1]!.expectedGeneration).toBe(1);
  expect(commands[1]!.operationId).not.toBe(commands[0]!.operationId);
});

test("two direct status retries for the same operation: delayed stale success cannot undo the newer failed GET", async ({ page }) => {
  let statusReads = 0;
  const commands: Array<{ operationId: string; expectedGeneration: number }> = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === STAFF_BASE) return { body: { items: [employee], nextCursor: null } };
      if (path === detailPath) return { body: {
        ...employee,
        locationAccess: {
          items: [{ locationId: LOCATION_A.locationId, name: LOCATION_A.name, status: "ACTIVE" }],
          totalCount: 1, truncated: false,
        },
        pendingInvitation: null,
      } };
      if (path === statusPath) {
        statusReads++;
        if (statusReads === 3 || statusReads === 5) {
          return { status: 503, body: {
            code: "STAFF_PASSWORD_RESET_UNAVAILABLE",
            message: "Synthetic status unavailable", requestId: `status-${statusReads}`,
          } };
        }
        return {
          delayMs: statusReads === 4 ? 750 : 0,
          body: { eligible: true, latestGeneration: 0, linkState: "NONE", expiresAt: null },
        };
      }
      if (path === issuePath) {
        commands.push(request.postDataJSON());
        return { status: 500, body: {
          code: "STAFF_PASSWORD_RESET_UNAVAILABLE",
          message: "Synthetic unknown commit", requestId: "issue-1",
        } };
      }
      return undefined;
    },
  });
  await openEmployees(page, fixture);
  await page.getByRole("table").getByRole("button").first().click();
  await page.getByRole("button", { name: "Reset password" }).click();
  const modal = page.getByRole("dialog", { name: "Reset employee password" });
  await modal.getByRole("button", { name: "Generate a password reset link" }).click();
  await expect(modal.getByText(/Current status could not be verified/)).toBeVisible();
  expect(statusReads).toBe(3);

  const refresh = modal.getByRole("button", { name: "Refresh status" });
  await refresh.click(); // direct GET #4, delayed eligible=true/generation=0
  await expect.poll(() => fixture.count(statusPath)).toBe(4);
  await expect(modal.getByText(/Checking the current generation/)).toBeVisible();
  await refresh.click(); // direct GET #5, fast 503, abort/fence #4
  await expect.poll(() => fixture.count(statusPath)).toBe(5);
  await expect(modal.getByText(/Current status could not be verified/)).toBeVisible();
  await page.waitForTimeout(850); // older #4's fixture delay has elapsed
  await expect(modal.getByText(/Current status could not be verified/)).toBeVisible();
  await expect(modal.getByRole("button", { name: "Generate a replacement link" })).toBeDisabled();
  expect(commands).toHaveLength(1);
});
