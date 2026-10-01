import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  browserSecretPresent,
  inviteResult,
  openEmployees,
  PENDING_DETAIL,
  PENDING_STAFF,
  STAFF_BASE,
  TEST_LINK,
} from "./support/issue240d-onboarding";

test.use({ trace: "off" });
const detailPath = `${STAFF_BASE}/${PENDING_STAFF.membershipId}`;
const resendPath = `${detailPath}/invitations`;

for (const fresh of [true, false]) {
  test(`pending detail and explicit resend ${fresh ? "fresh copy" : "reconciliation without link"}`, async ({
    page,
  }, info) => {
    let generation = 1;
    const bodies: unknown[] = [];
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path, request) => {
        if (path === STAFF_BASE)
          return { body: { items: [PENDING_STAFF], nextCursor: null } };
        if (path === detailPath)
          return {
            body: {
              ...PENDING_DETAIL,
              pendingInvitation: {
                ...PENDING_DETAIL.pendingInvitation,
                generation,
              },
            },
          };
        if (path === resendPath) {
          bodies.push(request.postDataJSON());
          generation++;
          return { status: 201, body: inviteResult(fresh, generation) };
        }
        return undefined;
      },
    });
    await openEmployees(page, fixture);
    await page.getByRole("table").getByRole("button").first().click();
    const drawer = page.getByRole("dialog");
    await expect(
      drawer.getByText("Invite pending", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      drawer.getByRole("button", {
        name: /activate|deactivate|save role|grant selected/i,
      }),
    ).toHaveCount(0);
    await expect(drawer.getByRole("combobox")).toHaveCount(0);
    expect(fixture.count(resendPath)).toBe(0);
    await page.screenshot({ path: info.outputPath("pending-detail.png") });
    await drawer.getByRole("button", { name: "Resend invite" }).click();
    await expect(
      drawer.getByText(
        fresh ? "Invite link generated" : /The original link is unavailable/,
      ),
    ).toBeVisible();
    expect(bodies.length).toBe(1);
    await expect.poll(() => fixture.count(detailPath)).toBe(2);
    await expect.poll(() => fixture.count(STAFF_BASE)).toBe(2);
    expect(fixture.count(`${detailPath}/location-access/candidates`)).toBe(0);
    expect(fixture.count(`${detailPath}/location-access`)).toBe(0);
    expect(await browserSecretPresent(page)).toBe(false);
    if (fresh) {
      await page
        .context()
        .grantPermissions(["clipboard-read", "clipboard-write"]);
      await drawer.getByRole("button", { name: "Copy link" }).click();
      expect(
        await page.evaluate(
          async (expected) =>
            (await navigator.clipboard.readText()) === expected,
          TEST_LINK,
        ),
      ).toBe(true);
    } else
      await expect(
        drawer.getByRole("button", { name: "Copy link" }),
      ).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("pending-result.png") });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await browserSecretPresent(page)).toBe(false);
  });
}

test("Resend MFA requires an explicit same-operation retry and nested Escape restores pending intent", async ({
  page,
}) => {
  const bodies: Record<string, unknown>[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === STAFF_BASE)
        return { body: { items: [PENDING_STAFF], nextCursor: null } };
      if (path === detailPath) return { body: PENDING_DETAIL };
      if (path === resendPath) {
        bodies.push(request.postDataJSON());
        return bodies.length === 1
          ? {
              status: 403,
              body: {
                code: "MFA_STEP_UP_REQUIRED",
                requestId: "240d-mfa",
                message: "Verify",
              },
            }
          : { status: 201, body: inviteResult() };
      }
      return undefined;
    },
  });
  await openEmployees(page, fixture);
  await page.getByRole("table").getByRole("button").first().click();
  await page.getByRole("button", { name: "Resend invite" }).click();
  const mfa = page.getByRole("dialog", { name: "Verification required" });
  await mfa.getByLabel("6-digit authenticator code").fill("123456");
  await mfa.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(mfa).toHaveCount(0);
  expect(bodies.length).toBe(1);
  await page.getByRole("button", { name: "Resend invite" }).click();
  await expect(page.getByText("Invite link generated")).toBeVisible();
  expect(bodies.length).toBe(2);
  expect(bodies[0]!.operationId === bodies[1]!.operationId).toBe(true);
});
