import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  fillCreate,
  inviteResult,
  openEmployees,
  PENDING_DETAIL,
  PENDING_STAFF,
  STAFF_BASE,
} from "./support/issue240d-onboarding";

test.use({ trace: "off" });
for (const resend of [false, true]) {
  test(`${resend ? "Resend" : "Create"} explicit retry cannot bypass grant/entitlement loss after MFA`, async ({
    page,
  }) => {
    let posts = 0,
      lost = false;
    const path = resend
      ? `${STAFF_BASE}/${PENDING_STAFF.membershipId}/invitations`
      : STAFF_BASE;
    const fixture = new DashboardApiFixture({
      locationManagerOrganizations: [ORG_A],
      locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (current, request) => {
        if (current === path && request.method() === "POST") {
          posts++;
          return {
            status: lost ? 404 : 403,
            body: {
              code: lost ? "AUTHORIZATION_DENIED" : "MFA_STEP_UP_REQUIRED",
              message: lost ? "This action is not authorized." : "Verify",
              requestId: "240d-authority",
            },
          };
        }
        if (current === `${STAFF_BASE}/${PENDING_STAFF.membershipId}`)
          return { body: PENDING_DETAIL };
        if (current === STAFF_BASE)
          return {
            body: { items: resend ? [PENDING_STAFF] : [], nextCursor: null },
          };
        return undefined;
      },
    });
    await openEmployees(page, fixture, true);
    if (resend)
      await page.getByRole("table").getByRole("button").first().click();
    else {
      await page
        .getByRole("button", { name: "Create Employee", exact: true })
        .click();
      await fillCreate(page);
    }
    const action = page
      .getByRole("dialog")
      .first()
      .getByRole("button", {
        name: resend ? "Resend invite" : "Create Employee",
        exact: true,
      });
    await action.click();
    const mfa = page.getByRole("dialog", { name: "Verification required" });
    await mfa.getByLabel("6-digit authenticator code").fill("123456");
    await mfa.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(mfa).toHaveCount(0);
    expect(posts).toBe(1);
    lost = true;
    await action.click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "Check your access",
    );
    expect(posts).toBe(2);
    await expect(page.getByText("Invite link generated")).toHaveCount(0);
  });
}

test("401 refresh replaces session and closes Create without replaying its POST", async ({
  page,
}) => {
  let posts = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === STAFF_BASE && request.method() === "POST") {
        posts++;
        return {
          status: 401,
          body: {
            code: "STAFF_AUTHENTICATION_REQUIRED",
            message: "Refresh",
            requestId: "240d-session",
          },
        };
      }
      if (path === STAFF_BASE) return { body: { items: [], nextCursor: null } };
      return undefined;
    },
  });
  await openEmployees(page, fixture);
  const refreshes = fixture.count("/v1/staff/auth/refresh");
  await page
    .getByRole("button", { name: "Create Employee", exact: true })
    .click();
  await (
    await fillCreate(page)
  )
    .getByRole("button", { name: "Create Employee", exact: true })
    .click();
  await expect
    .poll(() => fixture.count("/v1/staff/auth/refresh"))
    .toBe(refreshes + 1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(posts).toBe(1);
});

test("Create reconciliation offers explicit Resend without automatic rotation", async ({
  page,
}) => {
  let creates = 0,
    resends = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === STAFF_BASE && request.method() === "POST") {
        creates++;
        return { status: 201, body: inviteResult(false) };
      }
      if (path.endsWith("/invitations")) {
        resends++;
        return { status: 201, body: inviteResult(true, 2) };
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
  await expect(dialog.getByText(/original link is unavailable/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Copy link" })).toHaveCount(
    0,
  );
  expect(creates).toBe(1);
  expect(resends).toBe(0);
  await dialog.getByRole("button", { name: "Resend invite" }).click();
  await expect(dialog.getByText("Invite link generated")).toBeVisible();
  expect(resends).toBe(1);
});
