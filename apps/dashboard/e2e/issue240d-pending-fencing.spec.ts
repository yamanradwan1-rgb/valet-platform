import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  browserSecretPresent,
  deferred,
  inviteResult,
  openEmployees,
  PENDING_DETAIL,
  PENDING_STAFF,
  STAFF_BASE,
} from "./support/issue240d-onboarding";

test.use({ trace: "off" });
for (const failure of [false, true]) {
  test(`target A→B→A discards late Resend ${failure ? "failure" : "success link"}`, async ({
    page,
  }) => {
    const started = deferred(),
      release = deferred();
    const secondId = "88888888-8888-4888-8888-888888888888";
    let posts = 0;
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: async (path, request) => {
        if (path === STAFF_BASE)
          return {
            body: {
              items: [
                PENDING_STAFF,
                {
                  ...PENDING_STAFF,
                  membershipId: secondId,
                  identity: { ...PENDING_STAFF.identity, firstName: "Other" },
                },
              ],
              nextCursor: null,
            },
          };
        if (
          path === `${STAFF_BASE}/${PENDING_STAFF.membershipId}/invitations`
        ) {
          posts++;
          started.resolve();
          await release.promise;
          return failure
            ? {
                status: 409,
                body: {
                  code: "STAFF_ONBOARDING_UNAVAILABLE",
                  message: "Old failure",
                  requestId: "old-resend",
                },
              }
            : { status: 201, body: inviteResult() };
        }
        if (request.method() === "GET" && path.startsWith(`${STAFF_BASE}/`))
          return {
            body: {
              ...PENDING_DETAIL,
              membershipId: path.endsWith(secondId)
                ? secondId
                : PENDING_STAFF.membershipId,
              identity: {
                ...PENDING_STAFF.identity,
                firstName: path.endsWith(secondId) ? "Other" : "ليلى",
              },
            },
          };
        return undefined;
      },
    });
    await openEmployees(page, fixture);
    const rows = page.getByRole("table").getByRole("button");
    await rows.nth(0).click();
    await page.getByRole("button", { name: "Resend invite" }).click();
    await started.promise;
    for (const index of [1, 0]) {
      await rows
        .nth(index)
        .evaluate((button: HTMLButtonElement) => button.click());
      await expect(
        page
          .getByRole("dialog")
          .getByText(index === 1 ? "Other Smith" : "ليلى Smith", {
            exact: true,
          }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Resend invite" }),
      ).toBeEnabled();
    }
    const reads = fixture.count(STAFF_BASE);
    release.resolve();
    await page.waitForTimeout(150);
    await expect(page.getByText("Invite link generated")).toHaveCount(0);
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Resend invite" }),
    ).toBeEnabled();
    expect(posts).toBe(1);
    expect(fixture.count(STAFF_BASE)).toBe(reads);
    expect(await browserSecretPresent(page)).toBe(false);
  });
}
