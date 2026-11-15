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
const detail = {
  ...employee,
  locationAccess: {
    items: [{ locationId: LOCATION_A.locationId, name: LOCATION_A.name, status: "ACTIVE" }],
    totalCount: 1, truncated: false,
  },
  pendingInvitation: null,
};

for (const firstStatus of [500, 408]) {
  test(`HTTP ${firstStatus} issue outcome requires authoritative GET before an explicit ${firstStatus === 500 ? "replacement" : "same-operation retry"}`, async ({ page }) => {
    const commands: Array<{ operationId: string; expectedGeneration: number }> = [];
    let generation = 0;
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path, request) => {
        if (path === STAFF_BASE) return { body: { items: [employee], nextCursor: null } };
        if (path === detailPath) return { body: detail };
        if (path === statusPath) return {
          delayMs: generation ? 350 : 100,
          body: {
            eligible: true, latestGeneration: generation,
            linkState: generation ? "ACTIVE" : "NONE", expiresAt: null,
          },
        };
        if (path === issuePath) {
          const command = request.postDataJSON();
          commands.push(command);
          if (commands.length === 1) {
            if (firstStatus === 500) generation++; // Server COMMIT precedes failed HTTP reply
            return {
              status: firstStatus,
              body: {
                code: "STAFF_PASSWORD_RESET_UNAVAILABLE",
                message: "Synthetic failure after potential COMMIT",
                requestId: "issue416-synthetic",
              },
            };
          }
          generation++;
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
    await page.getByRole("button", { name: "Reset password" }).click();
    const modal = page.getByRole("dialog", { name: "Reset employee password" });
    await modal.getByRole("button", { name: "Generate a password reset link" }).click();
    await expect(modal.getByText(/The request may have committed|The result is unknown/)).toBeVisible();
    await expect.poll(() => fixture.count(statusPath)).toBeGreaterThanOrEqual(3);
    const expectedLabel = firstStatus === 500
      ? "Generate a replacement link" : "Retry original operation";
    const next = modal.getByRole("button", { name: expectedLabel });
    await expect(next).toBeEnabled();
    await expect(modal.getByRole("button", { name: "Copy link" })).toHaveCount(0);
    expect(commands).toHaveLength(1); // never auto POST after 408/500
    await next.click();
    await expect(modal.getByRole("button", { name: "Copy link" })).toBeVisible();
    expect(commands).toHaveLength(2);
    expect(commands[0]!.expectedGeneration).toBe(0);
    expect(commands[1]!.expectedGeneration).toBe(firstStatus === 500 ? 1 : 0);
    if (firstStatus === 500)
      expect(commands[1]!.operationId).not.toBe(commands[0]!.operationId);
    else
      expect(commands[1]!.operationId).toBe(commands[0]!.operationId);
  });
}

test("failed reconciliation GET blocks replacement until explicit successful status recheck", async ({ page }) => {
  let generation = 0;
  let failedRead = false;
  const commands: Array<{ operationId: string; expectedGeneration: number }> = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === STAFF_BASE) return { body: { items: [employee], nextCursor: null } };
      if (path === detailPath) return { body: detail };
      if (path === statusPath) {
        if (generation === 1 && !failedRead) {
          failedRead = true;
          return { status: 503, body: { code: "HTTP_ERROR", message: "GET unavailable", requestId: "synthetic" } };
        }
        return { body: {
          eligible: true, latestGeneration: generation,
          linkState: generation ? "ACTIVE" : "NONE", expiresAt: null,
        } };
      }
      if (path === issuePath) {
        commands.push(request.postDataJSON());
        generation++;
        return commands.length === 1
          ? { status: 500, body: { code: "HTTP_ERROR", message: "Reply lost", requestId: "synthetic" } }
          : { status: 201, body: {
            outcome: "LINK_ISSUED", membershipId: employee.membershipId,
            generation, expiresAt: "2026-11-14T10:00:00.000Z", resetLink,
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
  await expect(modal.getByRole("button", { name: "Generate a replacement link" })).toBeDisabled();
  expect(commands).toHaveLength(1);
  await modal.getByRole("button", { name: "Refresh status" }).click();
  const replacement = modal.getByRole("button", { name: "Generate a replacement link" });
  await expect(replacement).toBeEnabled();
  expect(commands).toHaveLength(1);
  await replacement.click();
  await expect(modal.getByRole("button", { name: "Copy link" })).toBeVisible();
  expect(commands[1]!.expectedGeneration).toBe(1);
});
