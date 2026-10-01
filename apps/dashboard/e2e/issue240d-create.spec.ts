import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  browserSecretPresent,
  fillCreate,
  inviteResult,
  openEmployees,
  PENDING_STAFF,
  STAFF_BASE,
  TEST_INVITE,
  TEST_LINK,
} from "./support/issue240d-onboarding";

test.use({ trace: "off" });

for (const manager of [false, true]) {
  test(`Create Employee ${manager ? "LM" : "CA"}: roles, one POST, bounded selector, fresh copy and focus`, async ({
    page,
  }, info) => {
    const bodies: Record<string, unknown>[] = [];
    const fixture = new DashboardApiFixture({
      ...(manager
        ? {
            locationManagerOrganizations: [ORG_A],
            locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
          }
        : {
            companyOrganizations: [ORG_A],
            companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
          }),
      override: (path, request) => {
        if (path === STAFF_BASE && request.method() === "POST") {
          bodies.push(request.postDataJSON());
          return { status: 201, body: inviteResult() };
        }
        if (path === STAFF_BASE)
          return {
            body: {
              items: bodies.length ? [PENDING_STAFF] : [],
              nextCursor: null,
            },
          };
        return undefined;
      },
    });
    await openEmployees(page, fixture, manager);
    const candidatePath = manager
      ? `/v1/staff/dashboard/organizations/${ORG_A.organizationId}/locations`
      : `/v1/staff/management/organizations/${ORG_A.organizationId}/locations`;
    const before = fixture.count(candidatePath),
      directoryBefore = fixture.count(STAFF_BASE);
    const trigger = page.getByRole("button", {
      name: "Create Employee",
      exact: true,
    });
    await trigger.click();
    const dialog = await fillCreate(page);
    await expect(dialog.getByLabel("Role").locator("option")).toHaveCount(
      manager ? 2 : 3,
    );
    await expect(dialog.locator('input[type="password"]')).toHaveCount(0);
    expect(fixture.count(candidatePath) - before).toBe(1);
    await page.screenshot({ path: info.outputPath("create-dialog.png") });
    await dialog
      .getByRole("button", { name: "Create Employee", exact: true })
      .click();
    await expect(dialog.getByText("Invite link generated")).toBeVisible();
    expect(bodies.length).toBe(1);
    expect(Object.keys(bodies[0]!).sort()).toEqual([
      "email",
      "firstName",
      "lastName",
      "locationIds",
      "operationId",
      "role",
    ]);
    expect((bodies[0]!.locationIds as string[]).length).toBe(1);
    await expect
      .poll(() => fixture.count(STAFF_BASE) - directoryBefore)
      .toBe(2);
    expect(await browserSecretPresent(page)).toBe(false);
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await dialog.getByRole("button", { name: "Copy link" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Link copied");
    expect(
      await page.evaluate(
        async (expected) => (await navigator.clipboard.readText()) === expected,
        TEST_LINK,
      ),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath("create-result.png") });
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    expect(await browserSecretPresent(page, TEST_INVITE)).toBe(false);
  });
}

test("Create MFA and network retry keep operationId; material edits change it; no automatic POST replay", async ({
  page,
}) => {
  const bodies: Record<string, unknown>[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === STAFF_BASE && request.method() === "POST") {
        bodies.push(request.postDataJSON());
        return bodies.length === 1
          ? {
              status: 403,
              body: {
                code: "MFA_STEP_UP_REQUIRED",
                requestId: "240d-mfa",
                message: "Assurance required",
              },
            }
          : {
              status: 500,
              body: {
                code: "INTERNAL_ERROR",
                requestId: "240d-error",
                message: "Unavailable",
              },
            };
      }
      if (path === STAFF_BASE) return { body: { items: [], nextCursor: null } };
      return undefined;
    },
  });
  await openEmployees(page, fixture);
  await page
    .getByRole("button", { name: "Create Employee", exact: true })
    .click();
  const dialog = await fillCreate(page);
  await dialog
    .getByRole("button", { name: "Create Employee", exact: true })
    .click();
  const mfa = page.getByRole("dialog").last();
  await mfa.getByLabel("6-digit authenticator code").fill("123456");
  await mfa.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  expect(bodies.length).toBe(1);
  await dialog
    .getByRole("button", { name: "Create Employee", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(bodies.length).toBe(2);
  expect(bodies[0]!.operationId === bodies[1]!.operationId).toBe(true);
  await dialog.getByLabel("First name").fill("Edited");
  await dialog
    .getByRole("button", { name: "Create Employee", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(bodies.length).toBe(3);
  expect(bodies[2]!.operationId === bodies[1]!.operationId).toBe(false);
});
