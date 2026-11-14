import { expect, test } from "@playwright/test";
import { staffDirectoryItem } from "./support/administration-fixtures";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { openEmployees, STAFF_BASE } from "./support/issue240d-onboarding";

test.use({ trace: "off" });

const staff = staffDirectoryItem();
const detailPath = `${STAFF_BASE}/${staff.membershipId}`;
const statusPath = `${detailPath}/password-resets/status`;
const issuePath = `${detailPath}/password-resets`;
const resetLink = `https://staff.example/staff/reset-password#reset=vspr1.${"A".repeat(43)}`;
const detail = {
  ...staff,
  locationAccess: {
    items: [{ locationId: LOCATION_A.locationId, name: LOCATION_A.name, status: "ACTIVE" }],
    totalCount: 1, truncated: false,
  },
  pendingInvitation: null,
};

test("CA only issues an eligible global User reset link and clears one-time copy on close", async ({ page }) => {
  let generation = 0;
  const commands: Array<{ operationId: string; expectedGeneration: number }> = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === STAFF_BASE) return { body: { items: [staff], nextCursor: null } };
      if (path === detailPath) return { body: detail };
      if (path === statusPath) return {
        body: { eligible: true, latestGeneration: generation, linkState: generation ? "ACTIVE" : "NONE", expiresAt: null },
      };
      if (path === issuePath) {
        commands.push(request.postDataJSON());
        generation++;
        return { status: 201, body: {
          outcome: "LINK_ISSUED", membershipId: staff.membershipId,
          generation, expiresAt: "2026-11-14T10:00:00.000Z", resetLink,
        } };
      }
      return undefined;
    },
  });
  await openEmployees(page, fixture);
  await page.getByRole("table").getByRole("button").first().click();
  const drawer = page.getByRole("dialog").first();
  await drawer.getByRole("button", { name: "Reset password" }).click();
  const modal = page.getByRole("dialog", { name: "Reset employee password" });
  await expect(modal).toBeVisible();
  await expect(modal.getByText("15 minutes", { exact: false })).toBeVisible();
  await modal.getByRole("button", { name: "Generate a password reset link" }).click();
  await expect(modal.getByRole("button", { name: "Copy link" })).toBeVisible();
  expect(commands).toHaveLength(1);
  expect(commands[0]!.expectedGeneration).toBe(0);
  expect(typeof commands[0]!.operationId).toBe("string");
  expect(Object.keys(commands[0]!).sort()).toEqual(["expectedGeneration", "operationId"]);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await modal.getByRole("button", { name: "Copy link" }).click();
  expect(await page.evaluate((value) => navigator.clipboard.readText().then((link) => link === value), resetLink)).toBe(true);
  expect((await page.locator("body").textContent())?.includes(resetLink)).toBe(false);
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await drawer.getByRole("button", { name: "Reset password" }).click();
  await expect(modal.getByRole("button", { name: "Copy link" })).toHaveCount(0);
  expect(fixture.count(issuePath)).toBe(1);
});

test("LM has no reset action or password-reset eligibility read", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === STAFF_BASE) return { body: { items: [staff], nextCursor: null } };
      if (path === detailPath) return { body: detail };
      return undefined;
    },
  });
  await openEmployees(page, fixture, true);
  await page.getByRole("table").getByRole("button").first().click();
  await expect(page.getByRole("button", { name: "Reset password" })).toHaveCount(0);
  expect(fixture.count(statusPath)).toBe(0);
  expect(fixture.count(issuePath)).toBe(0);
});

test("MFA requires explicit retry of same operation without a second automatic POST", async ({ page }) => {
  const operations: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === STAFF_BASE) return { body: { items: [staff], nextCursor: null } };
      if (path === detailPath) return { body: detail };
      if (path === statusPath) return {
        body: { eligible: true, latestGeneration: 0, linkState: "NONE", expiresAt: null },
      };
      if (path === issuePath) {
        operations.push(request.postDataJSON().operationId);
        return operations.length === 1
          ? { status: 403, body: { code: "MFA_STEP_UP_REQUIRED", message: "Verify", requestId: "416-mfa" } }
          : { status: 201, body: {
            outcome: "LINK_UNAVAILABLE", membershipId: staff.membershipId,
            generation: 1, expiresAt: "2026-11-14T10:00:00.000Z",
          } };
      }
      return undefined;
    },
  });
  await openEmployees(page, fixture);
  await page.getByRole("table").getByRole("button").first().click();
  await page.getByRole("button", { name: "Reset password" }).click();
  await page.getByRole("button", { name: "Generate a password reset link" }).click();
  const mfa = page.getByRole("dialog", { name: "Verification required" });
  await mfa.getByLabel("6-digit authenticator code").fill("123456");
  await mfa.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(mfa).toHaveCount(0);
  expect(operations).toHaveLength(1);
  await page.getByRole("button", { name: "Generate a password reset link" }).click();
  expect(operations).toHaveLength(2);
  expect(operations[0]).toBe(operations[1]);
  await expect(page.getByText("The previous link cannot be shown again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy link" })).toHaveCount(0);
});

test("ineligible active User is not offered reset issuance", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === STAFF_BASE) return { body: { items: [staff], nextCursor: null } };
      if (path === detailPath) return { body: detail };
      if (path === statusPath) return {
        body: { eligible: false, latestGeneration: 0, linkState: "NONE", expiresAt: null },
      };
      return undefined;
    },
  });
  await openEmployees(page, fixture);
  await page.getByRole("table").getByRole("button").first().click();
  await expect.poll(() => fixture.count(statusPath)).toBe(1);
  await expect(page.getByRole("button", { name: "Reset password" })).toHaveCount(0);
  expect(fixture.count(issuePath)).toBe(0);
});

test("an unknown issuance result reconciles status and needs explicit new operation", async ({ page }) => {
  let generation = 0;
  const commands: Array<{ operationId: string; expectedGeneration: number }> = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === STAFF_BASE) return { body: { items: [staff], nextCursor: null } };
      if (path === detailPath) return { body: detail };
      if (path === statusPath) return {
        body: {
          eligible: true, latestGeneration: generation,
          linkState: generation ? "ACTIVE" : "NONE", expiresAt: null,
        },
      };
      if (path === issuePath) {
        commands.push(request.postDataJSON());
        generation++;
        if (generation === 1) return { status: 200, body: { malformed: true } };
        return { status: 201, body: {
          outcome: "LINK_ISSUED", membershipId: staff.membershipId,
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
  await expect(modal.getByText(/request outcome is unknown/)).toBeVisible();
  await expect(modal.getByRole("button", { name: "Copy link" })).toHaveCount(0);
  expect(commands).toHaveLength(1);
  await modal.getByRole("button", { name: "Generate a replacement link" }).click();
  await expect(modal.getByRole("button", { name: "Copy link" })).toBeVisible();
  expect(commands).toHaveLength(2);
  expect(commands[1]!.expectedGeneration).toBe(1);
  expect(commands[0]!.operationId).not.toBe(commands[1]!.operationId);
});

test("closing during an issuance POST never exposes its later secret on reopen", async ({ page }) => {
  let generation = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === STAFF_BASE) return { body: { items: [staff], nextCursor: null } };
      if (path === detailPath) return { body: detail };
      if (path === statusPath) return {
        body: {
          eligible: true, latestGeneration: generation,
          linkState: generation ? "ACTIVE" : "NONE", expiresAt: null,
        },
      };
      if (path === issuePath) {
        generation++;
        return {
          delayMs: 600,
          status: 201,
          body: {
            outcome: "LINK_ISSUED", membershipId: staff.membershipId,
            generation, expiresAt: "2026-11-14T10:00:00.000Z", resetLink,
          },
        };
      }
      return undefined;
    },
  });
  await openEmployees(page, fixture);
  await page.getByRole("table").getByRole("button").first().click();
  const trigger = page.getByRole("button", { name: "Reset password" });
  await trigger.click();
  const modal = page.getByRole("dialog", { name: "Reset employee password" });
  await modal.getByRole("button", { name: "Generate a password reset link" }).click();
  await expect.poll(() => fixture.count(issuePath)).toBe(1);
  await modal.getByRole("button", { name: "Close" }).click();
  await expect(modal).toHaveCount(0);
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await expect(modal.getByRole("button", { name: "Copy link" })).toHaveCount(0);
  expect(fixture.count(issuePath)).toBe(1);
  await expect(modal.getByRole("button", { name: "Generate a replacement link" })).toBeVisible();
});
